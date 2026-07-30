import {
  ConfigStore,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { describe, expect, it } from "vitest";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubRemove } from "../helpers/stub-remove";

// Integration lane: pins the 400 every POST route answers to a body it cannot
// parse. One table over all seven, so the shared parse step cannot drift a
// route's status, error code or wording (#434). Everything behind the parse is
// stubbed — no route is reached.
describe("POST body parsing", () => {
  const PATH_MESSAGE = "Expected a JSON body with a path.";
  const TARGET_MESSAGE =
    'Expected a JSON body with type, name, and target ({ kind: "repo", repoPath } or { kind: "global" }).';
  const BULK_MESSAGE =
    'Expected a JSON body with a non-empty names array and a target ({ kind: "repo", repoPath } or { kind: "global" }).';

  const routes = [
    { path: "/api/inventory/connect", message: PATH_MESSAGE },
    { path: "/api/filesystem/children", message: PATH_MESSAGE },
    { path: "/api/registry/repos", message: PATH_MESSAGE },
    { path: "/api/deploy", message: TARGET_MESSAGE },
    { path: "/api/deploy/remove", message: TARGET_MESSAGE },
    { path: "/api/deploy/remove/preflight", message: TARGET_MESSAGE },
    { path: "/api/deploy/bulk", message: BULK_MESSAGE },
  ];

  function makeApp() {
    const fs = new NodeFileSystem();
    const store = new ConfigStore({
      fs,
      configPath: "/nonexistent-maestro/config.json",
    });
    const registry = new Registry({ fs, store });
    const inventory = new InventoryReader({
      fs,
      resolvePath: async () => undefined,
    });
    return createApp({
      registry,
      inventory,
      connect: stubConnect(),
      browse: stubBrowse(),
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry }),
      remove: stubRemove({ registry }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      enforceOriginHost: false,
    });
  }

  const post = (body: string) =>
    ({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }) as const;

  for (const route of routes) {
    it(`answers 400 with the route's own message when ${route.path} gets a body of the wrong shape`, async () => {
      const res = await makeApp().request(
        route.path,
        post(JSON.stringify({ unexpected: true })),
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "invalid-body",
        message: route.message,
      });
    });

    it(`answers 400 rather than throwing when ${route.path} gets text that is not JSON`, async () => {
      const res = await makeApp().request(route.path, post("not json"));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "invalid-body",
        message: route.message,
      });
    });
  }
});
