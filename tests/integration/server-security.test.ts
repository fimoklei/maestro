import { rm } from "node:fs/promises";
import { join } from "node:path";
import { InFlightLocks, InventoryReader, NodeFileSystem } from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { makeRepoDir } from "../helpers/repo-dir";
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

// The Origin/Host guard enabled, as in production: it blocks a malicious
// site POSTing to localhost (DNS rebinding, CSRF).
const LOCAL_HOST = "127.0.0.1:3000";
const LOCAL_ORIGIN = "http://127.0.0.1:3000";

describe("write-route Origin/Host guard", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await makeRepoDir("maestro-security-");
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
      folderChooser: stubFolderChooser(),
      update: stubUpdate(),
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

  it.each([
    ["DELETE", "/api/registry/repos"],
    ["POST", "/api/registry/repos/check"],
  ])("rejects a foreign Origin on %s %s", async (method, path) => {
    const res = await makeApp().request(path, {
      method,
      headers: {
        "content-type": "application/json",
        host: LOCAL_HOST,
        origin: "http://evil.example.com",
      },
      body: JSON.stringify({ path: dir }),
    });

    expect(res.status).toBe(403);
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

  it("rejects a connect from a foreign Origin", async () => {
    const res = await makeApp().request("/api/inventory/connect", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: LOCAL_HOST,
        origin: "http://evil.example.com",
      },
      body: JSON.stringify({ path: dir }),
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
