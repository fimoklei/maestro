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
  ReviewCreateOutcome,
  ReviewDecision,
  ReviewFailure,
  ReviewRequest,
  ReviewWriteOutcome,
  ViewerRead,
} from "./harness-review-port";

const defaultRun = promisify(execFile);

const REVIEW_READ_LIMIT = 100;

const GH_TIMEOUT_MS = 30_000;

const JSON_FIELDS = [
  "number",
  "url",
  "state",
  "mergedAt",
  "isDraft",
  "reviewDecision",
  "reviewRequests",
  "headRefName",
  "headRefOid",
  "baseRefName",
  "headRepository",
  "headRepositoryOwner",
  "author",
  "title",
].join(",");

const NON_INTERACTIVE = { GH_PROMPT_DISABLED: "1", NO_COLOR: "1" };

const OFFLINE_PHRASES = ["error connecting to"];

const NOT_SIGNED_IN = 4;

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

const urlSchema = z.string().regex(/^https:\/\/github\.com\/[^\s"'<>]+$/);

const createdUrlSchema = z
  .string()
  .regex(
    /^https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/pull\/[1-9][0-9]*$/,
  )
  .transform((url) => {
    const [, , , owner, repo, , number] = url.split("/");
    return { url, ownerRepo: `${owner}/${repo}`, number: Number(number) };
  });

const sameRepository = (ownerRepo: string, origin: GitOrigin): boolean =>
  ownerRepo.toLowerCase() === origin.ownerRepo.toLowerCase();

const commitSchema = z.string().regex(/^[0-9a-f]{40}$/);

const branchSchema = z
  .string()
  .regex(
    /^(?!@$)(?!\/)(?!.*\/$)(?!.*\/\/)(?!.*\.$)(?!(?:.*\/)?\.)(?!.*\.lock(?:\/|$))(?!.*\.\.)(?!.*@\{)[^\p{Cc}\s~^:?*[\\]+$/u,
  );

const loginSchema = z
  .string()
  .regex(/^(?:(?:app\/)?[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})|app\/)$/)
  .transform((login) => (login === "app/" ? "ghost" : login));

const viewerSchema = z.object({
  login: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/),
});

const reviewerSchema = z.discriminatedUnion("__typename", [
  z.object({ __typename: z.literal("User"), login: z.string() }),
  z.object({ __typename: z.literal("Team"), slug: z.string() }),
]);

const requestSchema = z.object({
  number: z.number().int().positive(),
  url: urlSchema,
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  mergedAt: z.string().nullable(),
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
  headRepository: z.object({ name: z.string() }).nullable(),
  headRepositoryOwner: z.object({ login: z.string() }).nullable(),
  author: z.object({ login: loginSchema }),
  title: z.string(),
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
    if (origin.host !== "github.com") {
      return { outcome: "unavailable", reason: "no-gh" };
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
      if (!noAnswerPossible(error)) {
        return { outcome: "failed" };
      }
      return {
        outcome: "unavailable",
        reason: isMissing(error) ? "no-gh" : "no-answer",
      };
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

  async readViewer(origin: GitOrigin): Promise<ViewerRead> {
    if (origin.host !== "github.com") {
      return { outcome: "unavailable" };
    }
    let stdout: string;
    try {
      ({ stdout } = await this.run(
        "gh",
        ["api", "--hostname", "github.com", "user", "--jq", "{login}"],
        {
          env: { ...process.env, ...NON_INTERACTIVE },
          timeout: GH_TIMEOUT_MS,
        },
      ));
    } catch (error) {
      return { outcome: noAnswerPossible(error) ? "unavailable" : "failed" };
    }
    const viewer = viewerSchema.safeParse(parseJson(stdout));
    return viewer.success
      ? { outcome: "read", login: viewer.data.login }
      : { outcome: "failed" };
  }

  async createRequest(
    origin: GitOrigin,
    request: NewReviewRequest,
  ): Promise<ReviewCreateOutcome> {
    const written = await this.invoke(origin, [
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
    if (!written.ok) {
      return written;
    }
    const created = createdUrlSchema.safeParse(written.stdout.trim());
    if (!created.success || !sameRepository(created.data.ownerRepo, origin)) {
      return { ok: false, error: "failed" };
    }
    return { ok: true, number: created.data.number, url: created.data.url };
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

  async editRequest(
    origin: GitOrigin,
    number: number,
    edit: { title: string },
  ): Promise<ReviewWriteOutcome> {
    return await this.write(origin, [
      "pr",
      "edit",
      String(number),
      "--repo",
      origin.ownerRepo,
      "--title",
      edit.title,
    ]);
  }

  private async write(
    origin: GitOrigin,
    args: string[],
  ): Promise<ReviewWriteOutcome> {
    const written = await this.invoke(origin, args);
    return written.ok ? { ok: true } : written;
  }

  private async invoke(
    origin: GitOrigin,
    args: string[],
  ): Promise<{ ok: true; stdout: string } | ReviewFailure> {
    if (origin.host !== "github.com") {
      return { ok: false, error: "unavailable" };
    }
    try {
      const { stdout } = await this.run("gh", args, {
        env: { ...process.env, ...NON_INTERACTIVE },
        timeout: GH_TIMEOUT_MS,
      });
      return { ok: true, stdout };
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
    state: row.mergedAt !== null ? "merged" : STATES[row.state],
    draft: row.isDraft,
    decision: DECISIONS[row.reviewDecision] ?? null,
    reviewers: row.reviewRequests.map(toReviewer),
    headOwner: row.headRepositoryOwner?.login ?? null,
    headRepo: row.headRepository?.name ?? null,
    headBranch: row.headRefName,
    headCommit: row.headRefOid,
    baseBranch: row.baseRefName,
    author: row.author.login,
    title: row.title,
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
    return undefined;
  }
}

function isMissing(error: unknown): boolean {
  return (error as { code?: unknown }).code === "ENOENT";
}

function noAnswerPossible(error: unknown): boolean {
  const { code, killed, stderr } = error as {
    code?: unknown;
    killed?: unknown;
    stderr?: unknown;
  };
  if (isMissing(error) || killed === true) {
    return true;
  }
  if (code === NOT_SIGNED_IN) {
    return true;
  }
  const haystack = normalizeCommandOutput(String(stderr ?? ""));
  return OFFLINE_PHRASES.some((phrase) => haystack.includes(phrase));
}
