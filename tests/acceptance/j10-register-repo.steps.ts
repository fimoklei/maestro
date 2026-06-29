import { mkdtemp, realpath as nodeRealpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import {
  ConfigStore,
  DeployStateReader,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { expect } from "vitest";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDrift } from "../helpers/stub-drift";

const feature = await loadFeature("tests/acceptance/j10-register-repo.feature");

// Acceptance lane for J10: drives the real server API against a temp config
// dir (never the real ~/.maestro), with the Origin/Host guard disabled — these
// scenarios read like the job map, not like server internals.
function buildApp(configPath: string) {
  const fs = new NodeFileSystem();
  const registry = new Registry({
    fs,
    store: new ConfigStore({ fs, configPath }),
  });
  const inventory = new InventoryReader({ fs, resolvePath: () => undefined });
  const deployState = new DeployStateReader({ fs });
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

function postRepo(app: ReturnType<typeof buildApp>, path: string) {
  return app.request("/api/registry/repos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

describeFeature(
  feature,
  ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
    let workspace: string;
    let configPath: string;
    let repoDir: string;
    let app: ReturnType<typeof buildApp>;
    let response: Response;

    BeforeEachScenario(async () => {
      workspace = await mkdtemp(join(tmpdir(), "maestro-j10-"));
      configPath = join(workspace, "config.json");
      repoDir = await mkdtemp(join(tmpdir(), "maestro-j10-repo-"));
      app = buildApp(configPath);
    });

    AfterEachScenario(async () => {
      await rm(workspace, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    });

    Scenario(
      "I register a repo by its path and see it listed",
      ({ Given, When, Then }) => {
        Given("a fresh cockpit with an empty registry", async () => {
          expect(
            await (await app.request("/api/registry/repos")).json(),
          ).toEqual({
            repos: [],
          });
        });
        When("I register the path of an existing directory", async () => {
          response = await postRepo(app, repoDir);
        });
        Then("that repo appears in the registered list", async () => {
          expect(response.status).toBe(201);
          const list = await (await app.request("/api/registry/repos")).json();
          expect(list).toEqual({
            repos: [{ path: await nodeRealpath(repoDir) }],
          });
        });
      },
    );

    Scenario(
      "An invalid path is rejected with a readable error",
      ({ Given, When, Then, And }) => {
        Given("a fresh cockpit with an empty registry", () => {});
        When("I try to register a relative path", async () => {
          response = await postRepo(app, "./not-absolute");
        });
        Then("the registration is rejected with a readable error", async () => {
          expect(response.status).toBe(400);
          expect(
            ((await response.json()) as { message: string }).message,
          ).toMatch(/\S/);
        });
        And("the registry stays empty", async () => {
          expect(
            await (await app.request("/api/registry/repos")).json(),
          ).toEqual({
            repos: [],
          });
        });
      },
    );

    Scenario(
      "Registration survives a restart",
      ({ Given, And, When, Then }) => {
        Given("a fresh cockpit with an empty registry", () => {});
        And("I have registered an existing directory", async () => {
          expect((await postRepo(app, repoDir)).status).toBe(201);
        });
        When("the cockpit restarts", () => {
          app = buildApp(configPath);
        });
        Then("that repo is still in the registered list", async () => {
          const list = await (await app.request("/api/registry/repos")).json();
          expect(list).toEqual({
            repos: [{ path: await nodeRealpath(repoDir) }],
          });
        });
      },
    );
  },
);
