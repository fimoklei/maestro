import {
  mkdir,
  mkdtemp,
  realpath as nodeRealpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigStore,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";

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
    const deployState = stubDeployState({ fs });
    return createApp({
      registry,
      inventory,
      deployState,
      deploy: stubDeploy({ inventory, registry }),
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
