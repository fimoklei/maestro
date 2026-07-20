import { mkdtemp, realpath as nodeRealpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import {
  ConfigStore,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { expect } from "vitest";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
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
    let secondRepoDir: string;
    let thirdRepoDir: string;
    let app: ReturnType<typeof buildApp>;
    let response: Response;

    BeforeEachScenario(async () => {
      workspace = await mkdtemp(join(tmpdir(), "maestro-j10-"));
      configPath = join(workspace, "config.json");
      repoDir = await mkdtemp(join(tmpdir(), "maestro-j10-repo-"));
      secondRepoDir = await mkdtemp(join(tmpdir(), "maestro-j10-repo2-"));
      thirdRepoDir = await mkdtemp(join(tmpdir(), "maestro-j10-repo3-"));
      app = buildApp(configPath);
    });

    AfterEachScenario(async () => {
      await rm(workspace, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
      await rm(secondRepoDir, { recursive: true, force: true });
      await rm(thirdRepoDir, { recursive: true, force: true });
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
      "I register a folder of repos in one go, and a bad one does not sink the rest",
      ({ Given, When, Then }) => {
        let outcomes: { path: string; ok: boolean }[];

        Given("a fresh cockpit with an empty registry", () => {});
        When(
          "I register a selection of repos where one path is bad",
          async () => {
            // What the cockpit does with a browse-picker selection: one POST per
            // path, in order, never stopping at the first refusal.
            const selection = [repoDir, "./not-absolute", secondRepoDir];
            outcomes = [];
            for (const path of selection) {
              const result = await postRepo(app, path);
              outcomes.push({ path, ok: result.status === 201 });
            }
          },
        );
        Then(
          "the good repos are registered and the bad one is reported as skipped",
          async () => {
            expect(outcomes).toEqual([
              { path: repoDir, ok: true },
              { path: "./not-absolute", ok: false },
              { path: secondRepoDir, ok: true },
            ]);
            const list = (await (
              await app.request("/api/registry/repos")
            ).json()) as { repos: { path: string }[] };
            expect(list.repos.map((repo) => repo.path)).toEqual([
              await nodeRealpath(repoDir),
              await nodeRealpath(secondRepoDir),
            ]);
          },
        );
      },
    );

    Scenario(
      "I register more repos from the sidebar, and re-picking one I already have changes nothing",
      ({ Given, When, Then }) => {
        Given("a cockpit that already has a repo registered", async () => {
          expect((await postRepo(app, repoDir)).status).toBe(201);
        });
        When(
          "I register a further selection that includes the repo I already have",
          async () => {
            // The steady-state case the sidebar opened up (issue #163):
            // registering against a registry that is not empty. The picker
            // greys out what is already registered, but that badge is a
            // client-side hint — a path can still arrive twice (a symlink to a
            // repo already in the list, or a hand-pasted path). The server is
            // what has to hold the line.
            for (const path of [secondRepoDir, repoDir, thirdRepoDir]) {
              expect((await postRepo(app, path)).status).toBe(201);
            }
          },
        );
        Then(
          "the new repos join the list and the one I already had is not duplicated",
          async () => {
            const list = (await (
              await app.request("/api/registry/repos")
            ).json()) as { repos: { path: string }[] };
            expect(list.repos.map((repo) => repo.path)).toEqual([
              await nodeRealpath(repoDir),
              await nodeRealpath(secondRepoDir),
              await nodeRealpath(thirdRepoDir),
            ]);
          },
        );
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
