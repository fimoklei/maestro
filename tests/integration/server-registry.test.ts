import {
  mkdir,
  mkdtemp,
  realpath as nodeRealpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InFlightLocks, InventoryReader, NodeFileSystem } from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubRemove } from "../helpers/stub-remove";

// Integration lane: drives the real Hono app via app.request, backed by a real
// Registry on a temp config dir. The Origin/Host guard is constructed disabled
// here — its enforcement is exercised in server-security.test.ts.
describe("registry HTTP routes", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "maestro-server-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function makeApp() {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(dir, "config.json"));
    const inventory = new InventoryReader({ fs, resolvePath: () => undefined });
    const deployState = stubDeployState({ fs });
    const locks = new InFlightLocks();
    return createApp({
      registry,
      inventory,
      deployState,
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      connect: stubConnect(),
      browse: stubBrowse(),
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
    expect(await get.json()).toEqual({ repos: [{ path: real }] });
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

  it("registers a picker selection one path at a time, never stopping at a refusal", async () => {
    // What the browse-picker does with a folder of repos: one POST per path, in
    // order. A bad path is skipped, the rest still land.
    const app = makeApp();
    const second = await mkdtemp(join(tmpdir(), "maestro-server-second-"));

    const outcomes = [];
    for (const path of [dir, "./not-absolute", second]) {
      outcomes.push((await postPath(app, path)).status);
    }

    expect(outcomes).toEqual([201, 400, 201]);
    expect(await listedPaths(app)).toEqual([
      await nodeRealpath(dir),
      await nodeRealpath(second),
    ]);
    await rm(second, { recursive: true, force: true });
  });

  it("does not duplicate a repo the registry already holds", async () => {
    // The picker greys out what is registered, but that badge is a client-side
    // hint: a symlinked or hand-pasted path can still arrive twice, so the
    // server is what has to hold the line (#163).
    const app = makeApp();
    const second = await mkdtemp(join(tmpdir(), "maestro-server-second-"));
    expect((await postPath(app, dir)).status).toBe(201);

    for (const path of [second, dir]) {
      expect((await postPath(app, path)).status).toBe(201);
    }

    expect(await listedPaths(app)).toEqual([
      await nodeRealpath(dir),
      await nodeRealpath(second),
    ]);
    await rm(second, { recursive: true, force: true });
  });

  it("still lists a registered repo through a freshly built app (a restart)", async () => {
    // registry-config-store.test.ts proves the store round-trips; this proves
    // the route reads the persisted config rather than in-process state.
    expect((await postPath(makeApp(), dir)).status).toBe(201);

    expect(await listedPaths(makeApp())).toEqual([await nodeRealpath(dir)]);
  });

  it("rejects a relative path with a readable 400", async () => {
    const res = await postPath(makeApp(), "./relative");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("relative");
    expect(body.message).toMatch(/\S/);
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
    expect(await res.json()).toEqual({
      error: "central-inventory",
      message:
        "The central inventory cannot be registered as a consuming repo.",
    });
  });
});
