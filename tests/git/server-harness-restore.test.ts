// Restoring a deleted skill folder, driven through the real Hono app against a
// real clone and a real bare remote. Four copies of the same skill exist —
// local HEAD's, origin/HEAD's, the proposal branch's and the release tag's —
// and only one of them may ever land on disk (ADR-0030, #888).
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ConfigStore,
  DeleteLocalSkill,
  HarnessFreshnessStore,
  HarnessGitAdapter,
  type HarnessState,
  InFlightLocks,
  InventoryReader,
  NodeCopyTreeFs,
  NodeFileSystem,
  PromoteSkill,
  PromoteSkillDeletion,
  ProposalActions,
  ReadHarnessState,
  RestoreSkill,
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

const FOLDER = ".apm/skills/tdd";

describe("harness restore HTTP route", { timeout: 30_000 }, () => {
  let base: string;
  let remote: string;
  let root: string;
  // The four deliberately different copies, so the one that lands proves which
  // source was read rather than which one happened to be identical.
  let localHead: string;

  const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });

  const writeSkill = async (body: string) => {
    await mkdir(join(root, ".apm", "skills", "tdd"), { recursive: true });
    await writeFile(
      join(root, ".apm", "skills", "tdd", "SKILL.md"),
      `---\ndescription: ${body}\n---\n`,
      "utf8",
    );
  };

  const commit = async (body: string, message: string) => {
    await writeSkill(body);
    await git(root, "add", ".");
    await git(root, "commit", "-m", message);
    return (await git(root, "rev-parse", "HEAD")).stdout.trim();
  };

  // The tree hash of the skill folder as it stands on disk, read the same way
  // the Harness read reads it.
  const onDisk = async () =>
    (await new HarnessGitAdapter().readMovementTrees(root))?.working.tdd ??
    null;

  const treeAt = async (ref: string) =>
    (await git(root, "rev-parse", `${ref}:${FOLDER}`)).stdout.trim();

  // Every ref both repositories hold, so nothing about a branch, a tag or a
  // remote-tracking ref can move without this test seeing it.
  const refs = async () => ({
    clone: (await git(root, "show-ref")).stdout,
    remote: (await git(remote, "show-ref")).stdout,
  });

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-server-restore-"));
    remote = join(base, "remote.git");
    root = join(base, "clone");
    await run("git", ["init", "--bare", "-b", "main", remote]);
    await run("git", ["clone", remote, root]);
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    // git resolves the GitHub origin to the bare repo next door, so the suite
    // stays offline (LEARNINGS · git-remote-get-url).
    await git(root, "config", `url.${remote}.insteadOf`, ORIGIN_URL);
    await git(root, "remote", "set-url", "origin", ORIGIN_URL);
    await writeFile(join(root, "apm.yml"), "name: agent-harness\n", "utf8");

    await commit("as released", "first skill");
    await git(root, "tag", "v0.1.0");
    await git(root, "push", "--tags", "origin", "HEAD:main");
    await commit("newer on origin", "a teammate's change");
    await git(root, "push", "origin", "HEAD:main");
    await commit("on the proposal branch", "proposed change");
    await git(root, "push", "origin", "HEAD:refs/heads/maestro/tdd");
    // The author's own commit, on this disk and nowhere else: the one copy a
    // restoration may ever choose.
    localHead = await commit("only in the local commit", "local work");

    await new HarnessGitAdapter().fetch(root);
  }, 30_000);

  afterEach(async () => {
    await removeGitTempTree(base);
  });

  function makeApp(review = stubReview()) {
    const fs = new NodeFileSystem();
    const configPath = join(base, "config.json");
    const registry = realRegistry(fs, configPath);
    const store = new ConfigStore({ fs, configPath: () => configPath });
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => root,
      readReleasedSkills: releasedSkillsFromGit(new HarnessGitAdapter()),
    });
    const locks = new InFlightLocks();
    const resolveRoot = async () => await fs.realpath(root);
    const harness = new ReadHarnessState({
      resolveRoot,
      git: new HarnessGitAdapter(),
      freshness: new HarnessFreshnessStore({ store }),
      review,
    });
    return createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      harness,
      publish: stubPublish(),
      promote: new PromoteSkill({
        resolveRoot,
        git: new HarnessGitAdapter(),
        freshness: new HarnessFreshnessStore({ store }),
        review,
        locks: new InFlightLocks(),
      }),
      promoteDeletion: new PromoteSkillDeletion({
        resolveRoot,
        git: new HarnessGitAdapter(),
        freshness: new HarnessFreshnessStore({ store }),
        review,
        locks: new InFlightLocks(),
      }),
      deleteLocalSkill: new DeleteLocalSkill({
        resolveRoot,
        fs,
        git: new HarnessGitAdapter(),
        locks: new InFlightLocks(),
      }),
      restoreSkill: new RestoreSkill({
        resolveRoot,
        fs,
        copyFs: new NodeCopyTreeFs(),
        git: new HarnessGitAdapter(),
        locks: new InFlightLocks(),
      }),
      proposals: new ProposalActions({
        resolveRoot,
        git: new HarnessGitAdapter(),
        review,
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

  const restore = async (app: ReturnType<typeof makeApp>, body: unknown) =>
    app.request("/api/harness/skill/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const readState = async (app: ReturnType<typeof makeApp>) =>
    (await (
      await app.request("/api/harness/refresh", { method: "POST" })
    ).json()) as HarnessState;

  const deleteFolder = () => rm(join(root, FOLDER), { recursive: true });

  it("offers the deleted skill as restorable, at the commit it read", async () => {
    const app = makeApp();
    await deleteFolder();

    const state = await readState(app);

    expect(state.localHeadCommit).toBe(localHead);
    const rows =
      state.stages.proposal.outcome === "read"
        ? state.stages.proposal.rows
        : [];
    expect(
      rows.map((row) => [row.skill, row.deletion, row.restorable]),
    ).toEqual([["tdd", true, true]]);
  });

  it("writes back the local commit's own copy, and none of the other three", async () => {
    const app = makeApp();
    const committed = await treeAt("HEAD");
    await deleteFolder();

    const response = await restore(app, {
      name: "tdd",
      seenHeadCommit: localHead,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "tdd", commit: localHead });
    // Byte for byte: the same tree hash git recorded in the commit.
    expect(await onDisk()).toBe(committed);
    // And nothing else was in the running: each other source differs.
    for (const ref of ["origin/main", "refs/remotes/origin/maestro/tdd"]) {
      expect(await treeAt(ref)).not.toBe(committed);
    }
    expect(await treeAt("refs/maestro/tags/v0.1.0")).not.toBe(committed);
  });

  it("leaves every ref, HEAD and the real index exactly as they were", async () => {
    const app = makeApp();
    await writeFile(join(root, "staged.md"), "staged\n", "utf8");
    await git(root, "add", "staged.md");
    await deleteFolder();
    const before = await refs();

    await restore(app, { name: "tdd", seenHeadCommit: localHead });

    expect(await refs()).toEqual(before);
    expect((await git(root, "rev-parse", "HEAD")).stdout.trim()).toBe(
      localHead,
    );
    // The unrelated staged file is still staged, and the folder is back with
    // nothing of its own left to report.
    expect((await git(root, "status", "--porcelain")).stdout).toBe(
      "A  staged.md\n",
    );
  });

  it("restores while GitHub is unreachable", async () => {
    const review = stubReview({ outcome: "unavailable" });
    const app = makeApp(review);
    await deleteFolder();

    const response = await restore(app, {
      name: "tdd",
      seenHeadCommit: localHead,
    });

    expect(response.status).toBe(200);
    expect(await onDisk()).toBe(await treeAt("HEAD"));
    // The restoration asked GitHub nothing at all; only the state read did.
    expect(review.created).toEqual([]);
  });

  // The proposal branch still holds a different copy, so the row stays: a
  // restoration answers for the folder, never for what review is waiting on.
  it("keeps the remaining difference visible after the folder is back", async () => {
    const app = makeApp();
    await deleteFolder();
    await restore(app, { name: "tdd", seenHeadCommit: localHead });

    const state = await readState(app);

    const rows =
      state.stages.proposal.outcome === "read"
        ? state.stages.proposal.rows
        : [];
    expect(rows.map((row) => [row.skill, row.status, row.restorable])).toEqual([
      ["tdd", "new-local-work", false],
    ]);
  });

  it("refuses when local HEAD moved after the confirmation read it", async () => {
    const app = makeApp();
    await deleteFolder();
    const before = await refs();

    const response = await restore(app, {
      name: "tdd",
      seenHeadCommit: "0000000000000000000000000000000000000000",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "head-moved" });
    expect(await onDisk()).toBeNull();
    expect(await refs()).toEqual(before);
  });

  it("refuses a skill whose deletion is already staged", async () => {
    const app = makeApp();
    await deleteFolder();
    await git(root, "add", "-A", "--", FOLDER);
    const staged = (await git(root, "status", "--porcelain")).stdout;

    const response = await restore(app, {
      name: "tdd",
      seenHeadCommit: localHead,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "staged-changes" });
    // The real index is the author's: the refusal left it exactly as it was.
    expect((await git(root, "status", "--porcelain")).stdout).toBe(staged);
    expect(await onDisk()).toBeNull();
  });

  it("refuses when anything already sits at the destination", async () => {
    const app = makeApp();
    await deleteFolder();
    await mkdir(join(root, FOLDER), { recursive: true });
    await writeFile(join(root, FOLDER, "notes.md"), "mine\n", "utf8");

    const response = await restore(app, {
      name: "tdd",
      seenHeadCommit: localHead,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "destination-exists" });
    // The reader's own file is untouched, and no committed file joined it.
    expect(
      (await git(root, "status", "--porcelain", "--", FOLDER)).stdout,
    ).toBe(` D ${FOLDER}/SKILL.md\n?? ${FOLDER}/notes.md\n`);
  });

  it("refuses a skill the confirmed commit does not hold", async () => {
    const app = makeApp();

    const response = await restore(app, {
      name: "absent",
      seenHeadCommit: localHead,
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "not-in-commit" });
  });

  it("refuses a body that carries no commit to compare", async () => {
    const app = makeApp();

    const response = await restore(app, { name: "tdd" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid-body" });
  });
});
