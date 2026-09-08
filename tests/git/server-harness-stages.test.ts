// The three stages through the real Hono app, a real clone and a real bare
// remote, with GitHub's side controlled at the port rather than by an account
// (#827 — Testing Decisions). Git says what the content is; the stub says what
// the team did with it.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ConfigStore,
  HarnessFreshnessStore,
  HarnessGitAdapter,
  type HarnessState,
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
  PromoteSkill,
  PromoteSkillDeletion,
  ReadHarnessState,
  type ReviewRequest,
  releasedSkillsFromGit,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";
import { realRegistry } from "../helpers/real-registry";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubImport } from "../helpers/stub-import";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubReview } from "../helpers/stub-review";
import { stubScaffold } from "../helpers/stub-scaffold";

const run = promisify(execFile);

const ORIGIN_URL = "https://github.com/fimoklei/agent-harness.git";

const request = (over: Partial<ReviewRequest> = {}): ReviewRequest => ({
  number: 45,
  url: "https://github.com/fimoklei/agent-harness/pull/45",
  state: "open",
  draft: false,
  decision: null,
  reviewers: [],
  headOwner: "fimoklei",
  headRepo: "agent-harness",
  headBranch: "maestro/tdd",
  baseBranch: "main",
  ...over,
});

describe("harness stages over HTTP", { timeout: 40_000 }, () => {
  let base: string;
  let remote: string;
  let root: string;
  let review: ReturnType<typeof stubReview>;

  const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });

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
    // offline while the origin still parses as GitHub (LEARNINGS ·
    // git-remote-get-url).
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

  function makeApp() {
    const fs = new NodeFileSystem();
    const configPath = join(base, "config.json");
    const registry = realRegistry(fs, configPath);
    const store = new ConfigStore({ fs, configPath: () => configPath });
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => root,
      // The real released read: these suites build real repositories,
      // so Inventory answers from `refs/maestro/tags` as it does live (#841).
      readReleasedSkills: releasedSkillsFromGit(new HarnessGitAdapter()),
    });
    const locks = new InFlightLocks();
    const resolveRoot = async () => await fs.realpath(root);
    return createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      harness: new ReadHarnessState({
        resolveRoot,
        git: new HarnessGitAdapter(),
        freshness: new HarnessFreshnessStore({ store }),
        review,
      }),
      publish: stubPublish(),
      promote: new PromoteSkill({
        resolveRoot,
        git: new HarnessGitAdapter(),
        freshness: new HarnessFreshnessStore({ store }),
        locks,
      }),
      promoteDeletion: new PromoteSkillDeletion({
        resolveRoot,
        git: new HarnessGitAdapter(),
        freshness: new HarnessFreshnessStore({ store }),
        locks,
      }),
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      connect: stubConnect(),
      scaffold: stubScaffold(),
      browse: stubBrowse(),
      enforceOriginHost: false,
    });
  }

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

  const rowsOf = (stage: HarnessState["stages"]["proposal"]) =>
    stage.outcome === "read" ? stage.rows : [];

  it("carries a skill through proposal, review and release as three separate rows", async () => {
    // Local edit → prepared proposal → an open request → a further local edit,
    // with the first change already merged: one skill, three pieces of work.
    const app = makeApp();
    await writeSkill("tdd", "first change");
    await promote(app, "tdd");
    review.answer({
      outcome: "read",
      requests: [request()],
      complete: true,
      limit: 100,
    });
    // The reviewer merges the proposal in the fixture's own remote.
    await git(
      remote,
      "update-ref",
      "refs/heads/main",
      "refs/heads/maestro/tdd",
    );
    // …and the author keeps editing afterwards.
    await writeSkill("tdd", "second change");

    const state = await refresh(app);

    expect(rowsOf(state.stages.proposal)).toMatchObject([
      { skill: "tdd", status: "new-local-work" },
    ]);
    expect(rowsOf(state.stages.review)).toMatchObject([
      { skill: "tdd", status: "waiting-for-review" },
    ]);
    expect(rowsOf(state.stages.release)).toMatchObject([
      { skill: "tdd", status: "changed" },
    ]);
    // Every row names the other two, in journey order.
    expect(rowsOf(state.stages.proposal)[0]?.alsoIn).toEqual([
      "pending-review",
      "pending-release",
    ]);
  });

  it("keeps the pull-request URL across a fresh read, never in the browser", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");
    review.answer({
      outcome: "read",
      requests: [request()],
      complete: true,
      limit: 100,
    });
    await refresh(app);

    // A second client, with nothing carried over from the first.
    const again = await read(makeApp());

    expect(rowsOf(again.stages.review)).toMatchObject([
      {
        skill: "tdd",
        requests: [
          {
            number: 45,
            url: "https://github.com/fimoklei/agent-harness/pull/45",
          },
        ],
      },
    ]);
  });

  it("never reads a pushed branch alone as an open review", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");

    const state = await refresh(app);

    expect(rowsOf(state.stages.review)).toMatchObject([
      { skill: "tdd", status: "pull-request-missing", requests: [] },
    ]);
  });

  it("reads a closed proposal whose content never merged as recoverable", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");
    review.answer({
      outcome: "read",
      requests: [request({ state: "closed" })],
      complete: true,
      limit: 100,
    });

    const state = await refresh(app);

    expect(rowsOf(state.stages.review)).toMatchObject([
      { skill: "tdd", status: "proposal-closed" },
    ]);
  });

  it("exposes every matching request instead of choosing one", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");
    review.answer({
      outcome: "read",
      requests: [
        request({
          number: 41,
          url: "https://github.com/fimoklei/agent-harness/pull/41",
        }),
        request({
          number: 44,
          url: "https://github.com/fimoklei/agent-harness/pull/44",
        }),
      ],
      complete: true,
      limit: 100,
    });

    const state = await refresh(app);

    expect(rowsOf(state.stages.review)).toMatchObject([
      {
        status: "multiple-pull-requests",
        requests: [{ number: 41 }, { number: 44 }],
      },
    ]);
  });

  it("puts a draft ahead of a requested change, and names the reviewers", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");
    review.answer({
      outcome: "read",
      requests: [
        request({
          draft: true,
          decision: "changes-requested",
          reviewers: [
            { kind: "user", login: "ada" },
            { kind: "team", slug: "fimoklei/reviewers" },
          ],
        }),
      ],
      complete: true,
      limit: 100,
    });

    const state = await refresh(app);

    expect(rowsOf(state.stages.review)).toMatchObject([
      {
        status: "draft",
        reviewers: [
          { kind: "user", login: "ada" },
          { kind: "team", slug: "fimoklei/reviewers" },
        ],
      },
    ]);
  });

  it("never matches a request opened from a foreign head or into another base", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");
    review.answer({
      outcome: "read",
      requests: [
        request({ headOwner: "someone-else" }),
        request({ number: 46, baseBranch: "release" }),
      ],
      complete: true,
      limit: 100,
    });

    const state = await refresh(app);

    expect(rowsOf(state.stages.review)).toMatchObject([
      { status: "pull-request-missing", requests: [] },
    ]);
  });

  it("leaves the git stages readable when GitHub cannot be asked", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    review.answer({ outcome: "unavailable" });

    const state = await refresh(app);

    expect(rowsOf(state.stages.proposal)).toMatchObject([
      { skill: "tdd", status: "not-yet-proposed" },
    ]);
    expect(state.stages.review).toEqual({ outcome: "unavailable" });
    expect(state.stages.release.outcome).toBe("read");
    // Membership is unknown, so no row claims to be the only one.
    expect(rowsOf(state.stages.proposal)[0]?.alsoIn).toBeNull();
  });

  it("keeps a local deletion out of another stage's reading", async () => {
    const app = makeApp();
    // A change that merged, and then the author deletes the skill locally.
    await writeSkill("tdd", "merged change");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "second");
    await git(root, "push", "origin", "HEAD:main");
    await new HarnessGitAdapter().fetch(root);
    await rm(join(root, ".apm", "skills", "tdd"), {
      recursive: true,
      force: true,
    });

    const state = await refresh(app);

    expect(rowsOf(state.stages.proposal)).toMatchObject([
      { skill: "tdd", status: "deleted-locally", deletion: true },
    ]);
    expect(rowsOf(state.stages.release)).toMatchObject([
      { skill: "tdd", status: "changed", deletion: false },
    ]);
  });

  it("asks GitHub once per read, about the Harness's own repository", async () => {
    await refresh(makeApp());

    expect(review.asked).toEqual(["fimoklei/agent-harness"]);
  });
});
