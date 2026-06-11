import { mkdtemp, rm } from "node:fs/promises";
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

// Integration lane with the Origin/Host guard ENABLED (production posture).
// Blocks DNS-rebinding / CSRF: a malicious site POSTing to localhost to make
// the machine register or deploy. See .claude/rules/security.md.
const LOCAL_HOST = "127.0.0.1:3000";
const LOCAL_ORIGIN = "http://127.0.0.1:3000";

describe("write-route Origin/Host guard", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "maestro-security-"));
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
      enforceOriginHost: true,
    });
  }

  function post(headers: Record<string, string>) {
    return makeApp().request("/api/registry/repos", {
      method: "POST",
      headers,
      body: JSON.stringify({ path: dir }),
    });
  }

  it("rejects a write from a foreign Origin", async () => {
    const res = await post({
      "content-type": "application/json",
      host: LOCAL_HOST,
      origin: "http://evil.example.com",
    });

    expect(res.status).toBe(403);
  });

  it("rejects a write with no Origin header", async () => {
    const res = await post({
      "content-type": "application/json",
      host: LOCAL_HOST,
    });

    expect(res.status).toBe(403);
  });

  it("rejects a write that is not application/json", async () => {
    const res = await post({
      "content-type": "text/plain",
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
    });

    expect(res.status).toBe(415);
  });

  it("guards a write to any route, not only the registry path", async () => {
    const res = await makeApp().request("/api/not-a-route-yet", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: LOCAL_HOST,
        origin: "http://evil.example.com",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(403);
  });

  it("allows a write from an allowlisted Host and same Origin", async () => {
    const res = await post({
      "content-type": "application/json",
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
    });

    expect(res.status).toBe(201);
  });
});
