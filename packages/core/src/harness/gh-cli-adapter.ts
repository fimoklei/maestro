// Drives the real gh CLI for one batched review read. Raw stdout and stderr
// never leave this module: only shape-checked fields and the outcome class
// cross (ADR-0018, ADR-0029, security.md). Nothing here is logged.
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

// gh's own default is 30 and would silently drop older requests. An answer that
// fills this bound is reported incomplete rather than as an absence.
export const REVIEW_READ_LIMIT = 100;

// A cockpit read must end. gh answers a whole repository in well under a
// second, so a run still going after this got no answer at all.
const GH_TIMEOUT_MS = 30_000;

// Exactly the fields consumed below (gh-driver.md § Invocation). An unknown one
// makes gh exit 1 and print the valid set, which pins this list against an
// upgrade.
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

// No prompt can hang the read, and no ANSI can wrap the payload. Nothing else
// is set: gh finds the author's own credentials, and Maestro adds none.
const NON_INTERACTIVE = { GH_PROMPT_DISABLED: "1", NO_COLOR: "1" };

// No answer arrived. Anything else gh says — a rejected token, a repository it
// will not resolve — is a reply, and stays a failed read.
const OFFLINE_PHRASES = ["error connecting to"];

// Documented gh exit code for "this command needs authentication".
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

// The one field that becomes a link the author can press, so it is bounded to
// the only host this port ever queries (ADR-0014).
const urlSchema = z.string().regex(/^https:\/\/github\.com\/[^\s"'<>]+$/);

// A full SHA-1 object name, the only form gh prints for a head commit
// (research 806 § 2). Anything else cannot be compared with a commit, so the
// row carrying it fails.
const commitSchema = z.string().regex(/^[0-9a-f]{40}$/);

// Only names git-check-ref-format(1) accepts, minus any whitespace. A branch
// crosses to the browser, so text that could not name one fails the row.
const branchSchema = z
  .string()
  .regex(
    /^(?!@$)(?!\/)(?!.*\/$)(?!.*\/\/)(?!.*\.$)(?!(?:.*\/)?\.)(?!.*\.lock(?:\/|$))(?!.*\.\.)(?!.*@\{)[^\p{Cc}\s~^:?*[\\]+$/u,
  );

const reviewerSchema = z.discriminatedUnion("__typename", [
  z.object({ __typename: z.literal("User"), login: z.string() }),
  z.object({ __typename: z.literal("Team"), slug: z.string() }),
]);

// A row that fails this fails the whole read: an unreadable answer must never
// arrive as a shorter one (gh-driver.md § Fields).
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
  // Both are null once the head repository is deleted; `nameWithOwner` is empty
  // in a list read, so the owner only ever arrives in the second field.
  headRepository: z.object({ name: z.string() }).nullable(),
  headRepositoryOwner: z.object({ login: z.string() }).nullable(),
});

const documentSchema = z.array(requestSchema);

// Injectable so command construction and classification can be unit-tested
// without spawning gh.
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
    // gh treats any other host as GitHub Enterprise and sends the query there,
    // so the gate runs before the call, not on its answer (ADR-0014).
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

  // `--head` names the branch, which is also what stops gh pushing or offering
  // a fork: nothing local is touched here (gh 2.86.0 `gh pr create --help`).
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

  // No `--delete-branch`: withdrawal leaves the proposal branch and the
  // author's files exactly as they are (#827).
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

  // One shape for all three: the host gate first, then the run, then a class.
  // A write prints only its own URL, so nothing is parsed back out of it.
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
    // Undefined fails the document shape, so unreadable output can never
    // become an empty answer.
    return undefined;
  }
}

// The failure text is read here and thrown away: nothing derived from it but
// the class crosses (security.md).
function noAnswerPossible(error: unknown): boolean {
  const { code, killed, stderr } = error as {
    code?: unknown;
    killed?: unknown;
    stderr?: unknown;
  };
  // No gh on this machine, or a run cut off by the timeout before any answer.
  if (code === "ENOENT" || killed === true) {
    return true;
  }
  if (code === NOT_SIGNED_IN) {
    return true;
  }
  const haystack = normalizeCommandOutput(String(stderr ?? ""));
  return OFFLINE_PHRASES.some((phrase) => haystack.includes(phrase));
}
