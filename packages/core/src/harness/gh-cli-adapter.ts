// Raw gh stdout and stderr never leave this module and are never logged: only
// shape-checked fields and the outcome class cross.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { GitOrigin } from "../deploy/git-origin";
import { normalizeCommandOutput } from "../normalize-command-output";
import type {
  HarnessReviewPort,
  HarnessReviewRead,
  NewReviewRequest,
  RequestedReviewer,
  ReviewDecision,
  ReviewRequest,
  ReviewWriteOutcome,
} from "./harness-review-port";

const defaultRun = promisify(execFile);

// gh's default of 30 would silently drop older requests. An answer that fills
// this bound is reported incomplete, never as an absence.
export const REVIEW_READ_LIMIT = 100;

const GH_TIMEOUT_MS = 30_000;

// Exactly the fields consumed below; an unknown one makes gh exit 1.
const JSON_FIELDS = [
  "number",
  "url",
  "state",
  "isDraft",
  "reviewDecision",
  "reviewRequests",
  "headRefName",
  "headRefOid",
  "baseRefName",
  "headRepository",
  "headRepositoryOwner",
].join(",");

// Nothing else is set: gh finds the author's own credentials; Maestro adds none.
const NON_INTERACTIVE = { GH_PROMPT_DISABLED: "1", NO_COLOR: "1" };

// Anything else gh says is a reply, and stays a failed read.
const OFFLINE_PHRASES = ["error connecting to"];

const NOT_SIGNED_IN = 4;

// gh prints `""` for a request nobody has reviewed, not null and not absent.
const DECISIONS: Record<string, ReviewDecision | null> = {
  "": null,
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes-requested",
  REVIEW_REQUIRED: "review-required",
};

const STATES = {
  OPEN: "open",
  CLOSED: "closed",
  MERGED: "merged",
} as const;

// Becomes a pressable link, so it is bounded to the only host queried.
const urlSchema = z.string().regex(/^https:\/\/github\.com\/[^\s"'<>]+$/);

const commitSchema = z.string().regex(/^[0-9a-f]{40}$/);

// git-check-ref-format(1) names minus whitespace: a branch crosses to the browser.
const branchSchema = z
  .string()
  .regex(
    /^(?!@$)(?!\/)(?!.*\/$)(?!.*\/\/)(?!.*\.$)(?!(?:.*\/)?\.)(?!.*\.lock(?:\/|$))(?!.*\.\.)(?!.*@\{)[^\p{Cc}\s~^:?*[\\]+$/u,
  );

const reviewerSchema = z.discriminatedUnion("__typename", [
  z.object({ __typename: z.literal("User"), login: z.string() }),
  z.object({ __typename: z.literal("Team"), slug: z.string() }),
]);

// A row that fails this fails the whole read, never a shorter answer.
const requestSchema = z.object({
  number: z.number().int().positive(),
  url: urlSchema,
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  isDraft: z.boolean(),
  reviewDecision: z.enum([
    "",
    "APPROVED",
    "CHANGES_REQUESTED",
    "REVIEW_REQUIRED",
  ]),
  reviewRequests: z.array(reviewerSchema),
  headRefName: branchSchema,
  headRefOid: commitSchema,
  baseRefName: branchSchema,
  // Null once the head repository is deleted; `nameWithOwner` is empty in a list read.
  headRepository: z.object({ name: z.string() }).nullable(),
  headRepositoryOwner: z.object({ login: z.string() }).nullable(),
});

const documentSchema = z.array(requestSchema);

type RunFn = (
  file: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; timeout: number },
) => Promise<{ stdout: string; stderr: string }>;

export class GhCliAdapter implements HarnessReviewPort {
  private readonly run: RunFn;

  constructor(deps?: { run?: RunFn }) {
    this.run = deps?.run ?? defaultRun;
  }

  async readReviews(origin: GitOrigin): Promise<HarnessReviewRead> {
    // gh sends any other host's query onward as GitHub Enterprise: gate before the call.
    if (origin.host !== "github.com") {
      return { outcome: "unavailable" };
    }

    let stdout: string;
    try {
      ({ stdout } = await this.run(
        "gh",
        [
          "pr",
          "list",
          "--repo",
          origin.ownerRepo,
          "--state",
          "all",
          "--limit",
          String(REVIEW_READ_LIMIT),
          "--json",
          JSON_FIELDS,
        ],
        {
          env: { ...process.env, ...NON_INTERACTIVE },
          timeout: GH_TIMEOUT_MS,
        },
      ));
    } catch (error) {
      return { outcome: noAnswerPossible(error) ? "unavailable" : "failed" };
    }

    const rows = documentSchema.safeParse(parseJson(stdout));
    if (!rows.success) {
      return { outcome: "failed" };
    }
    return {
      outcome: "read",
      requests: rows.data.map(toReviewRequest),
      complete: rows.data.length < REVIEW_READ_LIMIT,
      limit: REVIEW_READ_LIMIT,
    };
  }

  // `--head` stops gh pushing or offering a fork (gh 2.86.0).
  async createRequest(
    origin: GitOrigin,
    request: NewReviewRequest,
  ): Promise<ReviewWriteOutcome> {
    return await this.write(origin, [
      "pr",
      "create",
      "--repo",
      origin.ownerRepo,
      "--head",
      request.head,
      "--base",
      request.base,
      "--title",
      request.title,
      "--body",
      request.body,
    ]);
  }

  async reopenRequest(
    origin: GitOrigin,
    number: number,
  ): Promise<ReviewWriteOutcome> {
    return await this.write(origin, [
      "pr",
      "reopen",
      String(number),
      "--repo",
      origin.ownerRepo,
    ]);
  }

  // No `--delete-branch`: withdrawal leaves the proposal branch as it is (#827).
  async closeRequest(
    origin: GitOrigin,
    number: number,
  ): Promise<ReviewWriteOutcome> {
    return await this.write(origin, [
      "pr",
      "close",
      String(number),
      "--repo",
      origin.ownerRepo,
    ]);
  }

  private async write(
    origin: GitOrigin,
    args: string[],
  ): Promise<ReviewWriteOutcome> {
    if (origin.host !== "github.com") {
      return { ok: false, error: "unavailable" };
    }
    try {
      await this.run("gh", args, {
        env: { ...process.env, ...NON_INTERACTIVE },
        timeout: GH_TIMEOUT_MS,
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: noAnswerPossible(error) ? "unavailable" : "failed",
      };
    }
  }
}

function toReviewRequest(row: z.infer<typeof requestSchema>): ReviewRequest {
  return {
    number: row.number,
    url: row.url,
    state: STATES[row.state],
    draft: row.isDraft,
    decision: DECISIONS[row.reviewDecision] ?? null,
    reviewers: row.reviewRequests.map(toReviewer),
    headOwner: row.headRepositoryOwner?.login ?? null,
    headRepo: row.headRepository?.name ?? null,
    headBranch: row.headRefName,
    headCommit: row.headRefOid,
    baseBranch: row.baseRefName,
  };
}

function toReviewer(
  requested: z.infer<typeof reviewerSchema>,
): RequestedReviewer {
  return requested.__typename === "User"
    ? { kind: "user", login: requested.login }
    : { kind: "team", slug: requested.slug };
}

function parseJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    // Fails the document shape, so unreadable output never becomes an empty answer.
    return undefined;
  }
}

// Only the class crosses; the failure text is thrown away.
function noAnswerPossible(error: unknown): boolean {
  const { code, killed, stderr } = error as {
    code?: unknown;
    killed?: unknown;
    stderr?: unknown;
  };
  if (code === "ENOENT" || killed === true) {
    return true;
  }
  if (code === NOT_SIGNED_IN) {
    return true;
  }
  const haystack = normalizeCommandOutput(String(stderr ?? ""));
  return OFFLINE_PHRASES.some((phrase) => haystack.includes(phrase));
}
