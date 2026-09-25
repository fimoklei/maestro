import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  realpath as nodeRealpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ConfigStore,
  ConnectInventory,
  HarnessGitAdapter,
  InFlightLocks,
  InventoryReader,
  isRepositoryRoot,
  NodeFileSystem,
  probeHead,
  Registry,
  readConfiguredGitOriginUrl,
  releasedSkillsFromGit,
  resolveDefaultBranch,
  resolveInventoryPath,
  ScaffoldOffers,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type GitCloneOptions, initGitClone } from "../helpers/git-fixture";
import { centralInventoryPath } from "../helpers/real-registry";
import { stubDeploy, stubRetryOperation } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubFolderChooser } from "../helpers/stub-folder-chooser";
import { stubHarness } from "../helpers/stub-harness";
import { stubImport } from "../helpers/stub-import";
import { stubPromotes } from "../helpers/stub-promote";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubScaffold } from "../helpers/stub-scaffold";
import { stubUpdate } from "../helpers/stub-update";

const run = promisify(execFile);
const REMOTE_HEAD = "refs/remotes/origin/HEAD";

describe("inventory connect HTTP route", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "maestro-connect-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // Released by default: Inventory answers from the latest release (#841).
  async function makeClone(options?: GitCloneOptions): Promise<string> {
    const clone = join(dir, "agent-harness");
    await mkdir(join(clone, ".apm", "skills", "tdd"), { recursive: true });
    await writeFile(
      join(clone, ".apm", "skills", "tdd", "SKILL.md"),
      "---\nname: tdd\ndescription: Test-driven development loop\n---\n\n# tdd\n",
      "utf8",
    );
    await writeFile(join(clone, "apm.yml"), "dependencies: []\n", "utf8");
    await initGitClone(clone, { release: "v0.1.0", ...options });
    return clone;
  }

  function makeApp() {
    const fs = new NodeFileSystem();
    // Connect and the inventory reader share this store, so the test needs it.
    const store = new ConfigStore({
      fs,
      configPath: () => join(dir, "config.json"),
    });
    const registry = new Registry({
      fs,
      store,
      resolveCentralInventoryPath: centralInventoryPath,
    });
    const inventory = new InventoryReader({
      fs,
      resolvePath: async () => resolveInventoryPath(await store.read(), {}),
      // Real released read: Inventory answers from `refs/maestro/tags` (#841).
      readReleasedSkills: releasedSkillsFromGit(new HarnessGitAdapter()),
    });
    const deployState = stubDeployState({ fs });
    const locks = new InFlightLocks();
    return createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      connect: new ConnectInventory({
        fs,
        store,
        originUrl: readConfiguredGitOriginUrl,
        defaultBranch: resolveDefaultBranch,
        isRepositoryRoot,
        offers: new ScaffoldOffers(),
        probeHead,
        homeRoot: () => dir,
        clone: { clone: async () => "clone-unavailable" },
      }),
      scaffold: stubScaffold(),
      deployState,
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      retryOperation: stubRetryOperation({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      folderChooser: stubFolderChooser(),
      update: stubUpdate(),
      enforceOriginHost: false,
    });
  }

  async function readRemoteHead(clone: string): Promise<string | null> {
    return await run("git", ["-C", clone, "symbolic-ref", REMOTE_HEAD]).then(
      ({ stdout }) => stdout.trim(),
      () => null,
    );
  }

  function postConnect(app: ReturnType<typeof makeApp>, body: unknown) {
    return app.request("/api/inventory/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("connects a valid clone and reports the canonical path", async () => {
    const clone = await makeClone();
    const app = makeApp();

    const res = await postConnect(app, { path: clone });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      outcome: "found",
      inventoryPath: await nodeRealpath(clone),
      primitiveCount: 1,
    });
  });

  it("offers the scaffold for a GitHub repository that has no apm.yml", async () => {
    const repo = join(dir, "empty-repo");
    await mkdir(repo, { recursive: true });
    await initGitClone(repo);

    const res = await postConnect(makeApp(), { path: repo });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "scaffoldable",
      path: await nodeRealpath(repo),
    });
  });

  it("never offers the scaffold for a directory that is not a repository", async () => {
    const plain = join(dir, "just-a-folder");
    await mkdir(plain, { recursive: true });

    const res = await postConnect(makeApp(), { path: plain });

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "not-an-inventory" });
  });

  it("connects a Harness whose default branch is not named main", async () => {
    const clone = await makeClone({ defaultBranch: "trunk" });

    const res = await postConnect(makeApp(), { path: clone });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { outcome: string }).outcome).toBe("found");
  });

  // Without a recorded `origin/HEAD`, the one remote branch repairs it.
  it("repairs a missing origin/HEAD from the single remote branch and connects", async () => {
    const clone = await makeClone({
      defaultBranch: false,
      remoteBranches: ["trunk"],
    });

    const res = await postConnect(makeApp(), { path: clone });

    expect(res.status).toBe(200);
    expect(await readRemoteHead(clone)).toBe("refs/remotes/origin/trunk");
  });

  // A pruned default branch leaves `origin/HEAD` naming nothing.
  it("rejects a dangling origin/HEAD rather than reading it as the default branch", async () => {
    const clone = await makeClone({
      defaultBranch: "main",
      defaultBranchExists: false,
    });

    const res = await postConnect(makeApp(), { path: clone });

    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe(
      "no-default-branch",
    );
  });

  // Mirrored elsewhere, `origin/` holds whatever an older fetch left.
  it("refuses to repair when the branch wildcard maps somewhere other than origin", async () => {
    const clone = await makeClone({
      defaultBranch: false,
      remoteBranches: ["trunk"],
    });
    await run("git", [
      "-C",
      clone,
      "config",
      "remote.origin.fetch",
      "+refs/heads/*:refs/remotes/mirror/*",
    ]);

    const res = await postConnect(makeApp(), { path: clone });

    expect(res.status).toBe(422);
    expect(await readRemoteHead(clone)).toBeNull();
  });

  // `^refs/heads/x` makes the namespace incomplete.
  it("refuses to repair when a negative refspec narrows the wildcard", async () => {
    const clone = await makeClone({
      defaultBranch: false,
      remoteBranches: ["trunk"],
    });
    await run("git", [
      "-C",
      clone,
      "config",
      "--add",
      "remote.origin.fetch",
      "^refs/heads/release",
    ]);

    const res = await postConnect(makeApp(), { path: clone });

    expect(res.status).toBe(422);
    expect(await readRemoteHead(clone)).toBeNull();
  });

  // A `--single-branch` clone proves nothing about the remote's lead branch.
  it("refuses a single-branch clone rather than repairing origin/HEAD from its one branch", async () => {
    const clone = await makeClone({
      defaultBranch: false,
      remoteBranches: ["develop"],
    });
    await run("git", [
      "-C",
      clone,
      "config",
      "remote.origin.fetch",
      "+refs/heads/develop:refs/remotes/origin/develop",
    ]);

    const res = await postConnect(makeApp(), { path: clone });

    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe(
      "no-default-branch",
    );
    expect(await readRemoteHead(clone)).toBeNull();
  });

  it("rejects a Harness whose default branch cannot be established as 422 no-default-branch", async () => {
    const clone = await makeClone({
      defaultBranch: false,
      remoteBranches: ["trunk", "release"],
    });

    const res = await postConnect(makeApp(), { path: clone });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("no-default-branch");
    expect(JSON.stringify(body)).not.toContain(clone);
    expect(await readRemoteHead(clone)).toBeNull();
  });

  it("after a successful connect the inventory read lists the central skills", async () => {
    const clone = await makeClone();
    const app = makeApp();

    await postConnect(app, { path: clone });
    const res = await app.request("/api/inventory/primitives");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      primitives: [
        {
          type: "skill",
          name: "tdd",
          description: "Test-driven development loop",
        },
      ],
    });
  });

  // A confirmed zero is a valid connection, not a refusal (#841).
  it("connects a clone whose skills are not released yet and counts none", async () => {
    const clone = await makeClone({ release: undefined });
    const app = makeApp();

    const res = await postConnect(app, { path: clone });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      outcome: "found",
      inventoryPath: await nodeRealpath(clone),
      primitiveCount: 0,
    });
    const primitives = await app.request("/api/inventory/primitives");
    expect(await primitives.json()).toEqual({ primitives: [] });
  });

  it("rejects a malformed body with a 400", async () => {
    const res = await postConnect(makeApp(), { notPath: 1 });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "invalid-body",
    );
  });

  it("rejects a directory without apm.yml as 422 not-an-inventory", async () => {
    const plain = join(dir, "plain");
    await mkdir(plain, { recursive: true });

    const res = await postConnect(makeApp(), { path: plain });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not-an-inventory");
    expect(JSON.stringify(body)).not.toContain(plain);
  });

  // The picker refuses a symlinked manifest (#148), so connect agrees.
  it.each([
    ["dangling", "does-not-exist"],
    ["file-target", "real-manifest.yml"],
  ])("refuses to connect a %s symlinked apm.yml", async (_label, target) => {
    const linked = join(dir, `linked-${target}`);
    await mkdir(linked, { recursive: true });
    await writeFile(join(linked, "real-manifest.yml"), "dependencies: []\n");
    await symlink(join(linked, target), join(linked, "apm.yml"));
    await initGitClone(linked);

    const res = await postConnect(makeApp(), { path: linked });

    // The scaffold offer proves the symlink was never read as a manifest (#556).
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe(
      "scaffoldable",
    );
  });

  // The retired shape is not a fallback: refused out to the HTTP edge.
  it("refuses to connect the retired root skills/ shape", async () => {
    const retired = join(dir, "old-harness");
    await mkdir(join(retired, "skills", "tdd"), { recursive: true });
    await writeFile(
      join(retired, "skills", "tdd", "SKILL.md"),
      "---\nname: tdd\ndescription: Test-driven development loop\n---\n",
      "utf8",
    );
    await initGitClone(retired);

    const res = await postConnect(makeApp(), { path: retired });

    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe(
      "scaffoldable",
    );
  });

  it("rejects a Harness without a usable git origin as 422 no-usable-origin", async () => {
    const clone = await makeClone({ origin: false });

    const res = await postConnect(makeApp(), { path: clone });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("no-usable-origin");
    expect(JSON.stringify(body)).not.toContain(clone);
  });

  it("rejects a relative path with a 400", async () => {
    const res = await postConnect(makeApp(), { path: "./relative" });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("relative");
  });

  it("still reports success when the persisted path connects but its release cannot be read", async () => {
    // The path is already persisted when the count re-read fails, so the
    // reply must not become a 500; the count is null, never 0 (#841).
    const clone = await makeClone();
    await writeFile(
      join(clone, ".git", "refs", "maestro", "tags", "v0.1.0"),
      `${"0".repeat(39)}1\n`,
      "utf8",
    );
    const app = makeApp();

    const res = await postConnect(app, { path: clone });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      inventoryPath: string;
      primitiveCount: number | null;
    };
    expect(body.inventoryPath).toBe(await nodeRealpath(clone));
    expect(body.primitiveCount).toBeNull();

    const primitives = await app.request("/api/inventory/primitives");
    expect(primitives.status).toBe(503);
    expect(await primitives.json()).toEqual({ error: "unreadable" });
  });
});
