import { execFile } from "node:child_process";
import {
  chmod,
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
  BrowseFilesystem,
  ConfigStore,
  ConnectInventory,
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
  Registry,
  readGitOriginUrl,
  resolveDefaultBranch,
  resolveInventoryPath,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type GitCloneOptions, initGitClone } from "../helpers/git-fixture";
import { centralInventoryPath } from "../helpers/real-registry";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubHarness } from "../helpers/stub-harness";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";

const run = promisify(execFile);
const REMOTE_HEAD = "refs/remotes/origin/HEAD";

// Integration lane: drives the real Hono connect endpoint via app.request,
// backed by a real ConfigStore on a temp dir. The Origin/Host guard is disabled
// here (its enforcement lives in server-security.test.ts).
describe("inventory connect HTTP route", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "maestro-connect-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function makeClone(options?: GitCloneOptions): Promise<string> {
    const clone = join(dir, "agent-harness");
    await mkdir(join(clone, ".apm", "skills", "tdd"), { recursive: true });
    await writeFile(
      join(clone, ".apm", "skills", "tdd", "SKILL.md"),
      "---\nname: tdd\ndescription: Test-driven development loop\n---\n\n# tdd\n",
      "utf8",
    );
    await writeFile(join(clone, "apm.yml"), "dependencies: []\n", "utf8");
    await initGitClone(clone, options);
    return clone;
  }

  function makeApp() {
    const fs = new NodeFileSystem();
    // Wired inline rather than through realRegistry: connect and the inventory
    // reader share this store, so the test needs the instance itself.
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
    });
    const deployState = stubDeployState({ fs });
    const locks = new InFlightLocks();
    return createApp({
      registry,
      inventory,
      harness: stubHarness(),
      publish: stubPublish(),
      connect: new ConnectInventory({
        fs,
        store,
        originUrl: readGitOriginUrl,
        defaultBranch: resolveDefaultBranch,
      }),
      deployState,
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      // The real browser, ceilinged at this test's temp dir rather than the
      // user's home, so a picked path can be handed straight to connect.
      browse: new BrowseFilesystem({ fs, homeRoot: () => dir }),
      enforceOriginHost: false,
    });
  }

  // Durable repository state, not the response: what the connect left behind
  // in the clone is what a later authoring step will read.
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

  it("connects a Harness whose default branch is not named main", async () => {
    const clone = await makeClone({ defaultBranch: "trunk" });

    const res = await postConnect(makeApp(), { path: clone });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { outcome: string }).outcome).toBe("found");
  });

  // A clone git never recorded `origin/HEAD` for still knows its one remote
  // branch, so the connect repairs the pointer instead of refusing.
  it("repairs a missing origin/HEAD from the single remote branch and connects", async () => {
    const clone = await makeClone({
      defaultBranch: false,
      remoteBranches: ["trunk"],
    });

    const res = await postConnect(makeApp(), { path: clone });

    expect(res.status).toBe(200);
    expect(await readRemoteHead(clone)).toBe("refs/remotes/origin/trunk");
  });

  // A `--single-branch` clone holds one remote branch because it asked for
  // one, so that branch proves nothing about which one the remote leads with.
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
    // Two remote branches and no `origin/HEAD`: nothing local says which one
    // the remote leads with, and connect refuses rather than picking.
    const clone = await makeClone({
      defaultBranch: false,
      remoteBranches: ["trunk", "release"],
    });

    const res = await postConnect(makeApp(), { path: clone });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("no-default-branch");
    expect(body.message).toMatch(/\S/);
    expect(body.message).not.toContain(clone);
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

  it("connects a clone picked out of a browse listing", async () => {
    // The picker journey: browse the parent, take the path the listing hands
    // back, connect with exactly that. The two routes are covered apart
    // (server-filesystem.test.ts); this is the seam between them.
    const clone = await makeClone();
    const app = makeApp();

    const browse = await app.request("/api/filesystem/children", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: dir }),
    });
    expect(browse.status).toBe(200);
    const { entries } = (await browse.json()) as {
      entries: { name: string; path: string }[];
    };
    const picked = entries.find((entry) => entry.name === "agent-harness");
    expect(picked?.path).toBe(await nodeRealpath(clone));

    const res = await postConnect(app, { path: picked?.path });

    expect(res.status).toBe(200);
    const primitives = await app.request("/api/inventory/primitives");
    expect(await primitives.json()).toEqual({
      primitives: [
        {
          type: "skill",
          name: "tdd",
          description: "Test-driven development loop",
        },
      ],
    });
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
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("not-an-inventory");
    expect(body.message).toMatch(/\S/);
    expect(body.message).not.toContain(plain);
  });

  // The picker refuses a symlinked manifest outright (#148), so connect has to
  // agree: the manifest is a real file in the repo root or it is not a Harness.
  it.each([
    ["dangling", "does-not-exist"],
    ["file-target", "real-manifest.yml"],
  ])("rejects a %s symlinked apm.yml as 422", async (_label, target) => {
    const linked = join(dir, `linked-${target}`);
    await mkdir(linked, { recursive: true });
    await writeFile(join(linked, "real-manifest.yml"), "dependencies: []\n");
    await symlink(join(linked, target), join(linked, "apm.yml"));
    await initGitClone(linked);

    const res = await postConnect(makeApp(), { path: linked });

    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe(
      "not-an-inventory",
    );
  });

  // The retired shape is not a fallback (ADR-0021 §4): a clone that would have
  // connected before must now be refused all the way out to the HTTP edge.
  it("rejects the retired root skills/ shape as 422 not-an-inventory", async () => {
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
      "not-an-inventory",
    );
  });

  it("rejects a Harness without a usable git origin as 422 no-usable-origin", async () => {
    const clone = await makeClone({ origin: false });

    const res = await postConnect(makeApp(), { path: clone });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("no-usable-origin");
    expect(body.message).toMatch(/\S/);
    expect(body.message).not.toContain(clone);
  });

  it("rejects a relative path with a 400", async () => {
    const res = await postConnect(makeApp(), { path: "./relative" });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("relative");
  });

  it("still reports success when the persisted path connects but its .apm/skills/ becomes unreadable before the count re-read", async () => {
    // connect only probes apm.yml, so a 0o000 .apm/skills/ dir still passes
    // its is-an-inventory check; readdir (what the count re-read needs) requires
    // +r on the directory itself and fails. The path is already persisted by
    // the time that second read runs — the response must not turn into a 500
    // for a state change that already succeeded (Codex review finding).
    const clone = await makeClone();
    const skillsDir = join(clone, ".apm", "skills");
    await chmod(skillsDir, 0o000);
    const app = makeApp();

    try {
      const res = await postConnect(app, { path: clone });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        inventoryPath: string;
        primitiveCount: number;
      };
      expect(body.inventoryPath).toBe(await nodeRealpath(clone));
      expect(body.primitiveCount).toBe(0);
    } finally {
      await chmod(skillsDir, 0o700);
    }
  });
});
