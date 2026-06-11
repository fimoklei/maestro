import {
  mkdtemp,
  realpath as nodeRealpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigStore,
  DeployStateReader,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubDeploy } from "../helpers/stub-deploy";

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
    const registry = new Registry({
      fs,
      store: new ConfigStore({ fs, configPath: join(dir, "config.json") }),
    });
    const inventory = new InventoryReader({ fs, resolvePath: () => undefined });
    const deployState = new DeployStateReader({ fs });
    return createApp({
      registry,
      inventory,
      deployState,
      deploy: stubDeploy({ inventory, registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
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
});
