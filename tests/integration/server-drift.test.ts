import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CheckVersionDrift,
  ConfigStore,
  DeployStateReader,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubDeploy } from "../helpers/stub-deploy";

// Integration lane: drives the real Hono app via app.request. The drift route
// is registry-gated like deploy-state. A check that could not run is a 200 with
// { ok: false } — a legitimate "unknown", never an HTTP error the web treats as
// a crash. The Origin/Host guard is disabled here (it lives in server-security).
describe("drift HTTP route", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-drift-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  function makeApp(outcome: { ok: true; behind: string[] } | { ok: false }) {
    const fs = new NodeFileSystem();
    const registry = new Registry({
      fs,
      store: new ConfigStore({ fs, configPath: join(home, "config.json") }),
    });
    const inventory = new InventoryReader({ fs, resolvePath: () => undefined });
    const drift = new CheckVersionDrift({
      registry,
      apm: { checkOutdated: async () => outcome },
      canonicalPath: (path) => fs.realpath(path),
    });
    const app = createApp({
      registry,
      inventory,
      deployState: new DeployStateReader({ fs }),
      deploy: stubDeploy({ inventory, registry }),
      drift,
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      enforceOriginHost: false,
    });
    return { app, registry };
  }

  it("returns the behind set for a registered repo", async () => {
    const repo = await mkdtemp(join(tmpdir(), "maestro-repo-"));
    const { app, registry } = makeApp({ ok: true, behind: ["tdd"] });
    await registry.register(repo);

    const res = await app.request(
      `/api/drift?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ behind: ["tdd"] });
    await rm(repo, { recursive: true, force: true });
  });

  it("returns 200 with ok:false when the check could not run", async () => {
    const repo = await mkdtemp(join(tmpdir(), "maestro-repo-"));
    const { app, registry } = makeApp({ ok: false });
    await registry.register(repo);

    const res = await app.request(
      `/api/drift?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false });
    await rm(repo, { recursive: true, force: true });
  });

  it("rejects a repo that is not registered", async () => {
    const repo = await mkdtemp(join(tmpdir(), "maestro-repo-"));
    const { app } = makeApp({ ok: true, behind: ["tdd"] });

    const res = await app.request(
      `/api/drift?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(403);
    await rm(repo, { recursive: true, force: true });
  });

  it("returns 400 when no repo is given", async () => {
    const { app } = makeApp({ ok: true, behind: [] });

    const res = await app.request("/api/drift");

    expect(res.status).toBe(400);
  });
});
