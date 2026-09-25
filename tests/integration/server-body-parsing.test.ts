import { InFlightLocks, InventoryReader, NodeFileSystem } from "@maestro/core";
import { createApp } from "@maestro/server";
import { describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
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

// One table over every POST route, so the shared parse step cannot drift a
// route's status, code or wording (#434).
describe("POST body parsing", () => {
  const PATH_SHAPE = {
    message:
      "Maestro did not receive a folder. Reload the page, then choose a folder again.",
    detail: "The request carries a path: { path: string }.",
  };
  const TARGET_SHAPE = {
    message:
      "Maestro could not start this change. Reload the page, then try again.",
    detail:
      'The request carries a type, a name and a target: { kind: "repo", repoPath } or { kind: "global" }.',
  };
  const BULK_SHAPE = {
    message:
      "Nothing was deployed. Reload the page, then stage the skills again.",
    detail:
      'The request carries a non-empty names array and a target: { kind: "repo", repoPath } or { kind: "global" }.',
  };
  const PROPOSAL_SHAPE = {
    message:
      "Maestro could not change the pull request. Reload the page, then try again.",
    detail:
      "The request carries a skill name and a pull-request number: { name: string, number: number }.",
  };

  const routes = [
    { path: "/api/inventory/connect", shape: PATH_SHAPE },
    { path: "/api/folder-chooser", shape: PATH_SHAPE },
    { path: "/api/registry/repos", shape: PATH_SHAPE },
    { path: "/api/deploy", shape: TARGET_SHAPE },
    { path: "/api/deploy/remove", shape: TARGET_SHAPE },
    { path: "/api/deploy/remove/preflight", shape: TARGET_SHAPE },
    { path: "/api/deploy/bulk", shape: BULK_SHAPE },
    { path: "/api/harness/proposal/reopen", shape: PROPOSAL_SHAPE },
    { path: "/api/harness/proposal/withdraw", shape: PROPOSAL_SHAPE },
  ];

  function makeApp() {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, "/nonexistent-maestro/config.json");
    const inventory = new InventoryReader({
      fs,
      resolvePath: async () => undefined,
      readReleasedSkills: async () => [],
    });
    const locks = new InFlightLocks();
    return createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      folderChooser: stubFolderChooser(),
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      retryOperation: stubRetryOperation({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      update: stubUpdate(),
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
        ...route.shape,
      });
    });

    it(`answers 400 rather than throwing when ${route.path} gets text that is not JSON`, async () => {
      const res = await makeApp().request(route.path, post("not json"));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "invalid-body",
        ...route.shape,
      });
    });
  }

  // The expected shape rides in `detail` (#681).
  it("keeps the expected shape out of every request-shape sentence", async () => {
    for (const route of routes) {
      const res = await makeApp().request(
        route.path,
        post(JSON.stringify({ unexpected: true })),
      );
      const body = (await res.json()) as { message: string; detail: string };

      expect(body.message).not.toMatch(/[{}:]/);
      expect(body.detail).toMatch(/\{/);
    }
  });

  // Setting the Harness location never clones (#995).
  it("refuses a URL on connect when the body asks for a local clone only", async () => {
    const res = await makeApp().request(
      "/api/inventory/connect",
      post(
        JSON.stringify({
          path: "https://github.com/fimoklei/agent-harness",
          localOnly: true,
        }),
      ),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "not-a-folder-path" });
  });
});
