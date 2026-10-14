// Real app, clone and bare remote per test; GitHub stubbed at the port (#827).
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  HarnessGitAdapter,
  type HarnessState,
  type ReviewRequest,
} from "@maestro/core";
import { afterEach, beforeEach } from "vitest";
import { removeGitTempTree } from "./git-fixture";
import { nodeApp } from "./node-app";
import { type StubReview, stubReview } from "./stub-review";

const run = promisify(execFile);

const ORIGIN_URL = "https://github.com/fimoklei/agent-harness.git";

export const request = (over: Partial<ReviewRequest> = {}): ReviewRequest => ({
  number: 45,
  url: "https://github.com/fimoklei/agent-harness/pull/45",
  state: "open",
  draft: false,
  decision: null,
  reviewers: [],
  headOwner: "fimoklei",
  headRepo: "agent-harness",
  headBranch: "maestro/tdd",
  headCommit: "3d0f1a9c5b7e2846f0a1c3d5e7b9081726354adf",
  baseBranch: "main",
  author: "fimoklei",
  title: "Promote skill: tdd",
  ...over,
});

export const git = (cwd: string, ...args: string[]) =>
  run("git", args, { cwd });

export const rowsOf = (stage: HarnessState["stages"]["proposal"]) =>
  stage.outcome === "read" ? stage.rows : [];

// Read `base`, `remote`, `root` and `review` inside a test, never at collection.
export function useHarnessStages() {
  let base = "";
  let remote = "";
  let root = "";
  let review: StubReview;

  const writeSkill = async (name: string, body: string) => {
    await mkdir(join(root, ".apm", "skills", name), { recursive: true });
    await writeFile(
      join(root, ".apm", "skills", name, "SKILL.md"),
      `---\ndescription: ${body}\n---\n`,
      "utf8",
    );
  };

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-server-stages-"));
    remote = join(base, "remote.git");
    root = join(base, "clone");
    review = stubReview();
    await run("git", ["init", "--bare", "-b", "main", remote]);
    await run("git", ["clone", remote, root]);
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    // The GitHub origin resolves to the bare repo next door, so the suite stays
    // offline while the origin still parses as GitHub.
    await git(root, "config", `url.${remote}.insteadOf`, ORIGIN_URL);
    await git(root, "remote", "set-url", "origin", ORIGIN_URL);
    await writeSkill("tdd", "as published");
    await writeFile(join(root, "apm.yml"), "name: agent-harness\n", "utf8");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "first skill");
    await git(root, "tag", "v0.1.0");
    await git(root, "push", "--tags", "origin", "HEAD:main");
    await new HarnessGitAdapter().fetch(root);
  }, 40_000);

  afterEach(async () => {
    await removeGitTempTree(base);
  });

  const makeApp = () =>
    nodeApp(
      { HOME: base, MAESTRO_HOME: base, MAESTRO_INVENTORY_PATH: root },
      { gh: review },
    );

  type App = ReturnType<typeof makeApp>;

  const refresh = async (app: App): Promise<HarnessState> =>
    (await (
      await app.request("/api/harness/refresh", { method: "POST" })
    ).json()) as HarnessState;

  const read = async (app: App): Promise<HarnessState> =>
    (await (await app.request("/api/harness")).json()) as HarnessState;

  const promote = (app: App, name: string) =>
    app.request("/api/harness/promote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });

  const proposalAction = (
    app: App,
    action: "create" | "reopen" | "withdraw",
    body: Record<string, unknown>,
  ) =>
    app.request(`/api/harness/proposal/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const branchTree = async (name: string) =>
    (
      await git(root, "rev-parse", `refs/remotes/origin/maestro/${name}^{tree}`)
    ).stdout.trim();

  const answer = (requests: ReviewRequest[]) =>
    review.answer({ outcome: "read", requests, complete: true, limit: 100 });

  return {
    get base() {
      return base;
    },
    get remote() {
      return remote;
    },
    get root() {
      return root;
    },
    get review() {
      return review;
    },
    writeSkill,
    makeApp,
    refresh,
    read,
    promote,
    proposalAction,
    branchTree,
    answer,
  };
}

export type HarnessStagesApp = ReturnType<
  ReturnType<typeof useHarnessStages>["makeApp"]
>;
