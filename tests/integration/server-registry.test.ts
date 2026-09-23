import {
  mkdir,
  realpath as nodeRealpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { InFlightLocks, InventoryReader, NodeFileSystem } from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { makeRepoDir } from "../helpers/repo-dir";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
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

// Integration lane: drives the real Hono app via app.request, backed by a real
// Registry on a temp config dir. The Origin/Host guard is constructed disabled
// here — its enforcement is exercised in server-security.test.ts.
describe("registry HTTP routes", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await makeRepoDir("maestro-server-");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function makeApp() {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(dir, "config.json"));
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => undefined,
      readReleasedSkills: async () => [],
    });
    const deployState = stubDeployState({ fs });
    const locks = new InFlightLocks();
    return createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      deployState,
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      retryOperation: stubRetryOperation({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      browse: stubBrowse(),
      folderChooser: stubFolderChooser(),
      update: stubUpdate(),
      enforceOriginHost: false,
    });
  }

  it("GET /api/registry/repos returns an empty registry initially", async () => {
    const app = makeApp();

    const res = await app.request("/api/registry/repos");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ repos: [] });
  });

  it("POST registers a valid directory and GET then lists it", async () => {
    const app = makeApp();
    const real = await nodeRealpath(dir);

    const post = await app.request("/api/registry/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: dir }),
    });

    expect(post.status).toBe(201);
    expect(await post.json()).toEqual({ repos: [{ path: real }] });

    const get = await app.request("/api/registry/repos");
    expect(await get.json()).toEqual({
      repos: [{ path: real, status: "ready" }],
    });
  });

  it("GET states a folder gone from disk, or no longer a Git repository", async () => {
    const app = makeApp();
    const gone = await makeRepoDir("maestro-server-gone-");
    const plain = await makeRepoDir("maestro-server-plain-");
    for (const path of [gone, plain]) {
      expect((await postPath(app, path)).status).toBe(201);
    }
    const goneReal = await nodeRealpath(gone);
    await rm(gone, { recursive: true, force: true });
    await rm(join(plain, ".git"), { recursive: true, force: true });

    const res = await app.request("/api/registry/repos");

    expect(await res.json()).toEqual({
      repos: [
        { path: goneReal, status: "folder-missing" },
        { path: await nodeRealpath(plain), status: "not-a-git-repo" },
      ],
    });
    await rm(plain, { recursive: true, force: true });
  });

  async function postPath(app: ReturnType<typeof makeApp>, path: string) {
    return app.request("/api/registry/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
  }

  const listedPaths = async (app: ReturnType<typeof makeApp>) => {
    const res = await app.request("/api/registry/repos");
    const { repos } = (await res.json()) as { repos: { path: string }[] };
    return repos.map((repo) => repo.path);
  };

  it("refuses a repo the registry already holds, and keeps one entry", async () => {
    // A symlinked or hand-pasted path can arrive twice, so the server is what
    // has to hold the line (#163).
    const app = makeApp();
    const second = await makeRepoDir("maestro-server-second-");
    expect((await postPath(app, dir)).status).toBe(201);
    expect((await postPath(app, second)).status).toBe(201);

    const again = await postPath(app, dir);

    expect(again.status).toBe(400);
    expect(await again.json()).toEqual({ error: "already-registered" });
    expect(await listedPaths(app)).toEqual([
      await nodeRealpath(dir),
      await nodeRealpath(second),
    ]);
    await rm(second, { recursive: true, force: true });
  });

  it("refuses a folder that is not a Git repository and writes nothing", async () => {
    const app = makeApp();
    const plain = join(dir, "notes");
    await mkdir(plain);

    const res = await postPath(app, plain);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "not-a-git-repo" });
    expect(await listedPaths(app)).toEqual([]);
  });

  async function checkPath(app: ReturnType<typeof makeApp>, path: string) {
    return app.request("/api/registry/repos/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
  }

  it("checks a picked folder the way registering would, and registers nothing", async () => {
    const app = makeApp();

    const ok = await checkPath(app, dir);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ path: await nodeRealpath(dir) });

    const refused = await checkPath(app, join(dir, "does-not-exist"));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "not-found" });

    expect(await listedPaths(app)).toEqual([]);
  });

  async function unregisterPath(app: ReturnType<typeof makeApp>, path: string) {
    return app.request("/api/registry/repos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
  }

  it("unregisters a repo by its listed path and leaves the folder on disk", async () => {
    const app = makeApp();
    expect((await postPath(app, dir)).status).toBe(201);
    const [listed] = await listedPaths(app);

    const res = await unregisterPath(app, listed ?? "");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ repos: [] });
    expect(await listedPaths(app)).toEqual([]);
    expect((await stat(dir)).isDirectory()).toBe(true);
  });

  it("answers 404 for a path the registry does not hold", async () => {
    const res = await unregisterPath(makeApp(), dir);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not-registered" });
  });

  it("still lists a registered repo through a freshly built app (a restart)", async () => {
    // registry-config-store.test.ts proves the store round-trips; this proves
    // the route reads the persisted config rather than in-process state.
    expect((await postPath(makeApp(), dir)).status).toBe(201);

    expect(await listedPaths(makeApp())).toEqual([await nodeRealpath(dir)]);
  });

  it("rejects a relative path with its own 400 code", async () => {
    const res = await postPath(makeApp(), "./relative");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("relative");
  });

  it("rejects a non-existent path with a readable 400", async () => {
    const res = await postPath(makeApp(), join(dir, "does-not-exist"));

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("not-found");
  });

  it("rejects a file (not a directory) with a readable 400", async () => {
    const filePath = join(dir, "notes.txt");
    await writeFile(filePath, "hi", "utf8");

    const res = await postPath(makeApp(), filePath);

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "not-a-directory",
    );
  });

  it("rejects the configured central inventory with a readable 400", async () => {
    const inventoryPath = join(dir, "agent-harness");
    await mkdir(inventoryPath);
    await writeFile(
      join(dir, "config.json"),
      JSON.stringify({ repos: [], inventoryPath }),
      "utf8",
    );

    const res = await postPath(makeApp(), inventoryPath);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "central-inventory" });
  });
});
