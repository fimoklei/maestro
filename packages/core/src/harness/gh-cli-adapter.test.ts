import { describe, expect, it } from "vitest";
import { GhCliAdapter, REVIEW_READ_LIMIT } from "./gh-cli-adapter";

// The adapter shells out via an injected `run` (promisify(execFile) in
// production). These tests pin the command construction, the shape check and
// the failure classification without spawning gh and without a GitHub account:
// every payload below is a real `gh pr list --json` capture replayed through
// `run` (gh-driver.md § Testing).
type RunCall = {
  file: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  timeout?: number;
};

const origin = { host: "github.com", ownerRepo: "fimoklei/harness" };

// The head commit of `fimoklei/harness` #8, captured on gh 2.86.0 (2026-09-08)
// and recorded in `docs/research/806-gh-pull-request-status.md` § 2. It stands
// for both rows below; `cli/cli` #14398 has no capture of its own.
const capturedHeadOid = "a7cbf2efbd0eb978503342906593ef81ca724894";

// Captured verbatim from `gh pr list --repo fimoklei/harness --state all
// --limit 3 --json number,url,state,isDraft,reviewDecision,reviewRequests,
// headRefName,baseRefName,headRepository,headRepositoryOwner` on gh 2.86.0
// (2026-09-08), reduced to one row. Note `nameWithOwner` is empty in a list
// read — the head repository's owner only arrives in `headRepositoryOwner`.
const mergedRow = {
  baseRefName: "main",
  headRefName: "maestro/agent-native-cli",
  headRefOid: capturedHeadOid,
  headRepository: { id: "R_kgDOT_xZSw", name: "harness", nameWithOwner: "" },
  headRepositoryOwner: { id: "MDQ6VXNlcjE2OTU3MjU4", login: "fimoklei" },
  isDraft: false,
  number: 8,
  reviewDecision: "",
  reviewRequests: [],
  state: "MERGED",
  url: "https://github.com/fimoklei/harness/pull/8",
};

// Captured verbatim from the same command against `cli/cli` on gh 2.86.0
// (2026-09-08): an open request from a fork, awaiting a named reviewer.
const openForkRow = {
  baseRefName: "trunk",
  headRefName: "issue-12195",
  headRefOid: capturedHeadOid,
  headRepository: { id: "R_kgDOUSrCEg", name: "cli", nameWithOwner: "" },
  headRepositoryOwner: {
    id: "MDQ6VXNlcjMwMDI1OA==",
    name: "Tim Mattison",
    login: "timmattison",
  },
  isDraft: false,
  number: 14398,
  reviewDecision: "REVIEW_REQUIRED",
  reviewRequests: [{ __typename: "User", login: "sergiou87" }],
  state: "OPEN",
  url: "https://github.com/cli/cli/pull/14398",
};

function fakeRun(stdout: string) {
  const calls: RunCall[] = [];
  const run = async (
    file: string,
    args: string[],
    options: { env: NodeJS.ProcessEnv; timeout?: number },
  ) => {
    calls.push({ file, args, env: options.env, timeout: options.timeout });
    return { stdout, stderr: "" };
  };
  return { calls, run };
}

function failingRun(error: unknown) {
  const calls: RunCall[] = [];
  const run = async (
    file: string,
    args: string[],
    options: { env: NodeJS.ProcessEnv; timeout?: number },
  ) => {
    calls.push({ file, args, env: options.env, timeout: options.timeout });
    throw error;
  };
  return { calls, run };
}

const exitError = (code: number, stderr: string) =>
  Object.assign(new Error("gh failed"), { code, stdout: "", stderr });

describe("GhCliAdapter", () => {
  it("reads every request in one batched, bounded, all-state call", async () => {
    const { calls, run } = fakeRun(JSON.stringify([mergedRow]));

    await new GhCliAdapter({ run }).readReviews(origin);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.file).toBe("gh");
    expect(calls[0]?.args).toEqual([
      "pr",
      "list",
      "--repo",
      "fimoklei/harness",
      "--state",
      "all",
      "--limit",
      String(REVIEW_READ_LIMIT),
      "--json",
      "number,url,state,isDraft,reviewDecision,reviewRequests,headRefName,headRefOid,baseRefName,headRepository,headRepositoryOwner",
    ]);
  });

  it("disables prompts and bounds execution time", async () => {
    const { calls, run } = fakeRun("[]");

    await new GhCliAdapter({ run }).readReviews(origin);

    expect(calls[0]?.env.GH_PROMPT_DISABLED).toBe("1");
    expect(calls[0]?.timeout).toBeGreaterThan(0);
  });

  it("passes ambient environment and no credential of its own", async () => {
    const { calls, run } = fakeRun("[]");

    await new GhCliAdapter({ run }).readReviews(origin);

    const added = Object.entries(calls[0]?.env ?? {}).filter(
      ([key, value]) => process.env[key] !== value,
    );
    expect(added).toEqual([
      ["GH_PROMPT_DISABLED", "1"],
      ["NO_COLOR", "1"],
    ]);
  });

  it("never sends a request to a host other than github.com", async () => {
    const { calls, run } = fakeRun("[]");

    const result = await new GhCliAdapter({ run }).readReviews({
      host: "github.example.com",
      ownerRepo: "acme/harness",
    });

    expect(result).toEqual({ outcome: "unavailable" });
    expect(calls).toHaveLength(0);
  });

  it("turns a captured row into typed review facts", async () => {
    const { run } = fakeRun(JSON.stringify([openForkRow]));

    const result = await new GhCliAdapter({ run }).readReviews(origin);

    expect(result).toEqual({
      outcome: "read",
      complete: true,
      limit: REVIEW_READ_LIMIT,
      requests: [
        {
          number: 14398,
          url: "https://github.com/cli/cli/pull/14398",
          state: "open",
          draft: false,
          decision: "review-required",
          reviewers: [{ kind: "user", login: "sergiou87" }],
          headOwner: "timmattison",
          headRepo: "cli",
          headBranch: "issue-12195",
          headCommit: capturedHeadOid,
          baseBranch: "trunk",
        },
      ],
    });
  });

  it("reads an empty review decision as no verdict, and MERGED as merged", async () => {
    const { run } = fakeRun(JSON.stringify([mergedRow]));

    const result = await new GhCliAdapter({ run }).readReviews(origin);

    expect(result).toMatchObject({
      outcome: "read",
      requests: [{ state: "merged", decision: null, reviewers: [] }],
    });
  });

  it("names a requested team by its organisation and slug", async () => {
    const { run } = fakeRun(
      JSON.stringify([
        {
          ...openForkRow,
          reviewRequests: [
            { __typename: "Team", name: "Core", slug: "acme/core" },
          ],
        },
      ]),
    );

    const result = await new GhCliAdapter({ run }).readReviews(origin);

    expect(result).toMatchObject({
      requests: [{ reviewers: [{ kind: "team", slug: "acme/core" }] }],
    });
  });

  it("reads an empty array as a complete answer of none", async () => {
    const { run } = fakeRun("[]");

    const result = await new GhCliAdapter({ run }).readReviews(origin);

    expect(result).toEqual({
      outcome: "read",
      requests: [],
      complete: true,
      limit: REVIEW_READ_LIMIT,
    });
  });

  it("reports an answer that filled its bound as incomplete", async () => {
    const rows = Array.from({ length: REVIEW_READ_LIMIT }, (_, index) => ({
      ...mergedRow,
      number: index + 1,
    }));
    const { run } = fakeRun(JSON.stringify(rows));

    const result = await new GhCliAdapter({ run }).readReviews(origin);

    expect(result).toMatchObject({ outcome: "read", complete: false });
  });

  it("fails the read on output that is not JSON", async () => {
    const { run } = fakeRun("To get started with GitHub CLI, please run:");

    const result = await new GhCliAdapter({ run }).readReviews(origin);

    expect(result).toEqual({ outcome: "failed" });
  });

  it("fails the whole read when one row fails the shape", async () => {
    const { run } = fakeRun(
      JSON.stringify([mergedRow, { ...openForkRow, url: 42 }]),
    );

    const result = await new GhCliAdapter({ run }).readReviews(origin);

    expect(result).toEqual({ outcome: "failed" });
  });

  it("fails the read on a state gh has never printed", async () => {
    const { run } = fakeRun(JSON.stringify([{ ...mergedRow, state: "DRAFT" }]));

    const result = await new GhCliAdapter({ run }).readReviews(origin);

    expect(result).toEqual({ outcome: "failed" });
  });

  it("fails the read on a request url outside github.com", async () => {
    const { run } = fakeRun(
      JSON.stringify([
        { ...mergedRow, url: "javascript:alert(1)//github.com/a/b/pull/1" },
      ]),
    );

    const result = await new GhCliAdapter({ run }).readReviews(origin);

    expect(result).toEqual({ outcome: "failed" });
  });

  it("fails the read on a head commit that is not a full object name", async () => {
    const { run } = fakeRun(
      JSON.stringify([{ ...mergedRow, headRefOid: "a7cbf2e" }]),
    );

    const result = await new GhCliAdapter({ run }).readReviews(origin);

    expect(result).toEqual({ outcome: "failed" });
  });

  it("reports a missing gh as an unavailable capability", async () => {
    const { run } = failingRun(
      Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" }),
    );

    const result = await new GhCliAdapter({ run }).readReviews(origin);

    expect(result).toEqual({ outcome: "unavailable" });
  });

  it("reports an unauthenticated gh as an unavailable capability", async () => {
    const { run } = failingRun(
      exitError(
        4,
        "To get started with GitHub CLI, please run:  gh auth login",
      ),
    );

    const result = await new GhCliAdapter({ run }).readReviews(origin);

    expect(result).toEqual({ outcome: "unavailable" });
  });

  it("reports an unreachable host as an unavailable capability", async () => {
    const { run } = failingRun(
      exitError(
        1,
        "error connecting to api.github.com\ncheck your internet connection",
      ),
    );

    const result = await new GhCliAdapter({ run }).readReviews(origin);

    expect(result).toEqual({ outcome: "unavailable" });
  });

  it("reports a run cut off by the timeout as an unavailable capability", async () => {
    const { run } = failingRun(
      Object.assign(new Error("timed out"), { killed: true, stderr: "" }),
    );

    const result = await new GhCliAdapter({ run }).readReviews(origin);

    expect(result).toEqual({ outcome: "unavailable" });
  });

  it("reports a rejected credential as a failed read", async () => {
    const { run } = failingRun(
      exitError(
        1,
        "HTTP 401: Bad credentials (https://api.github.com/graphql)",
      ),
    );

    const result = await new GhCliAdapter({ run }).readReviews(origin);

    expect(result).toEqual({ outcome: "failed" });
  });

  it("reports an unreachable repository as a failed read, with no cause invented", async () => {
    const { run } = failingRun(
      exitError(
        1,
        "GraphQL: Could not resolve to a Repository with the name 'fimoklei/harness'. (repository)",
      ),
    );

    const result = await new GhCliAdapter({ run }).readReviews(origin);

    expect(result).toEqual({ outcome: "failed" });
  });

  it("opens a request over a named branch, never the current one", async () => {
    // `--head` is what makes gh skip its push-or-fork prompt entirely, and
    // `--repo` is what keeps the call off whatever repository the cwd is
    // (gh 2.86.0 `gh pr create --help`).
    const { calls, run } = fakeRun(
      "https://github.com/fimoklei/harness/pull/9\n",
    );

    const result = await new GhCliAdapter({ run }).createRequest(origin, {
      head: "maestro/tdd",
      base: "main",
      title: "Promote skill: tdd",
      body: "Proposed from the Maestro cockpit.",
    });

    expect(result).toEqual({ ok: true });
    expect(calls[0]?.args).toEqual([
      "pr",
      "create",
      "--repo",
      "fimoklei/harness",
      "--head",
      "maestro/tdd",
      "--base",
      "main",
      "--title",
      "Promote skill: tdd",
      "--body",
      "Proposed from the Maestro cockpit.",
    ]);
    expect(calls[0]?.env.GH_PROMPT_DISABLED).toBe("1");
    expect(calls[0]?.timeout).toBeGreaterThan(0);
  });

  it("reopens and closes a request by its number, keeping the branch", async () => {
    // No `--delete-branch`: withdrawal leaves the proposal branch standing,
    // which is what keeps a closed proposal recoverable (#827).
    const reopen = fakeRun("");
    const close = fakeRun("");

    await new GhCliAdapter({ run: reopen.run }).reopenRequest(origin, 45);
    await new GhCliAdapter({ run: close.run }).closeRequest(origin, 45);

    expect(reopen.calls[0]?.args).toEqual([
      "pr",
      "reopen",
      "45",
      "--repo",
      "fimoklei/harness",
    ]);
    expect(close.calls[0]?.args).toEqual([
      "pr",
      "close",
      "45",
      "--repo",
      "fimoklei/harness",
    ]);
  });

  it("sends no write to a host other than github.com", async () => {
    const elsewhere = { host: "github.example.com", ownerRepo: "acme/harness" };
    const create = fakeRun("");
    const reopen = fakeRun("");
    const close = fakeRun("");

    const results = [
      await new GhCliAdapter({ run: create.run }).createRequest(elsewhere, {
        head: "maestro/tdd",
        base: "main",
        title: "t",
        body: "b",
      }),
      await new GhCliAdapter({ run: reopen.run }).reopenRequest(elsewhere, 45),
      await new GhCliAdapter({ run: close.run }).closeRequest(elsewhere, 45),
    ];

    expect(results).toEqual([
      { ok: false, error: "unavailable" },
      { ok: false, error: "unavailable" },
      { ok: false, error: "unavailable" },
    ]);
    expect([create.calls, reopen.calls, close.calls]).toEqual([[], [], []]);
  });

  it("reports a write GitHub refused as failed, and an unaskable one as unavailable", async () => {
    const refused = failingRun(
      exitError(1, "GraphQL: Pull request is closed (repository)"),
    );
    const missing = failingRun(
      Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" }),
    );

    expect(
      await new GhCliAdapter({ run: refused.run }).reopenRequest(origin, 45),
    ).toEqual({ ok: false, error: "failed" });
    expect(
      await new GhCliAdapter({ run: missing.run }).closeRequest(origin, 45),
    ).toEqual({ ok: false, error: "unavailable" });
  });

  it("lets no word of gh's own output cross a refused write", async () => {
    const { run } = failingRun(
      exitError(
        1,
        "HTTP 403: Resource not accessible by personal access token",
      ),
    );

    const result = await new GhCliAdapter({ run }).closeRequest(origin, 45);

    expect(JSON.stringify(result)).not.toContain("personal access token");
  });

  it("lets no word of gh's own output cross the port", async () => {
    const stderr =
      "HTTP 401: Bad credentials at https://api.github.com/graphql";
    const { run } = failingRun(exitError(1, stderr));

    const result = await new GhCliAdapter({ run }).readReviews(origin);

    expect(JSON.stringify(result)).not.toContain("Bad credentials");
    expect(JSON.stringify(result)).not.toContain("api.github.com");
  });
});
