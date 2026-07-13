import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import {
  ConfigStore,
  DeploySkill,
  DeployStateReader,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { expect } from "vitest";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDrift } from "../helpers/stub-drift";

const feature = await loadFeature(
  "tests/acceptance/j10-j01-j06-j02-tracer.feature",
);

// The single end-to-end journey for the tracer (issue #14): the five endpoints
// in sequence against real temp dirs. Only the ApmDriver is faked — its
// deploySkill writes the captured real apm.lock.yaml (the fixture) into the
// target repo and resolveLatestTag returns the fixture's tag — so the journey
// is deterministic and needs no network. Everything else is real file I/O.
const FIXTURE_TAG = "v0.5.0";
const lockfileFixture = await readFile(
  "tests/fixtures/apm.lock.tag-pinned.yaml",
  "utf8",
);

function buildApp(configPath: string, inventoryPath: string) {
  const fs = new NodeFileSystem();
  const registry = new Registry({
    fs,
    store: new ConfigStore({ fs, configPath }),
  });
  const inventory = new InventoryReader({
    fs,
    resolvePath: () => inventoryPath,
  });
  const deployState = new DeployStateReader({ fs });
  const deploy = new DeploySkill({
    inventory,
    registry,
    apm: {
      resolveLatestTag: async () => ({ ok: true, tag: FIXTURE_TAG }),
      deploySkill: async ({ target }) => {
        if (target.kind !== "repo") {
          throw new Error("this journey deploys to a repo only");
        }
        await writeFile(
          join(target.repoPath, "apm.lock.yaml"),
          lockfileFixture,
          "utf8",
        );
      },
    },
    inventoryGit: {
      skillExistsAtTag: async () => true,
      skillDivergesFromTag: async () => false,
    },
    deployedContent: { classify: async () => "not-deployed" },
    inventoryOriginUrl: async () => "git@github.com:fimoklei/agent-harness.git",
    canonicalPath: (path) => fs.realpath(path),
  });
  return createApp({
    registry,
    inventory,
    deployState,
    deploy,
    drift: stubDrift({ registry }),
    resolveGlobalRoot: () => "/nonexistent-apm-root",
    connect: stubConnect(),
    browse: stubBrowse(),
    enforceOriginHost: false,
  });
}

describeFeature(
  feature,
  ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
    let workspace: string;
    let harness: string;
    let repo: string;
    let app: ReturnType<typeof buildApp>;
    let response: Response;

    BeforeEachScenario(async () => {
      workspace = await mkdtemp(join(tmpdir(), "maestro-tracer-"));
      harness = await mkdtemp(join(tmpdir(), "maestro-tracer-harness-"));
      repo = await mkdtemp(join(tmpdir(), "maestro-tracer-repo-"));
      const skillDir = join(harness, "skills", "tdd");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        "---\nname: tdd\ndescription: Test-driven development loop\n---\n",
        "utf8",
      );
      app = buildApp(join(workspace, "config.json"), harness);
    });

    AfterEachScenario(async () => {
      for (const dir of [workspace, harness, repo]) {
        await rm(dir, { recursive: true, force: true });
      }
    });

    function register() {
      return app.request("/api/registry/repos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: repo }),
      });
    }

    function deploy() {
      return app.request("/api/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "skill",
          name: "tdd",
          target: { kind: "repo", repoPath: repo },
        }),
      });
    }

    Scenario("I register a repo I work in (J10)", ({ Given, When, Then }) => {
      Given("a project directory on my machine", () => {
        // `repo` exists as a real temp directory.
      });
      When("I register it with Maestro", async () => {
        response = await register();
      });
      Then("it appears in the list of registered repos", async () => {
        expect(response.status).toBe(201);
        const listed = await app.request("/api/registry/repos");
        const { repos } = (await listed.json()) as {
          repos: Array<{ path: string }>;
        };
        expect(
          repos.some((r) => r.path.endsWith(repo.split("/").pop() ?? "")),
        ).toBe(true);
      });
    });

    Scenario(
      "I see every primitive available centrally (J01)",
      ({ Given, When, Then }) => {
        Given("a central inventory with the tdd skill", () => {
          // Written into the temp harness in BeforeEachScenario.
        });
        When("I open the inventory", async () => {
          response = await app.request("/api/inventory/primitives");
        });
        Then("I see the tdd skill with its description", async () => {
          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({
            primitives: [
              {
                type: "skill",
                name: "tdd",
                description: "Test-driven development loop",
              },
            ],
          });
        });
      },
    );

    Scenario(
      "I deploy a skill to a registered repo with one action (J06)",
      ({ Given, When, Then }) => {
        Given(
          "a registered repo and a central inventory with the tdd skill",
          async () => {
            await register();
          },
        );
        When("I deploy the tdd skill to that repo", async () => {
          response = await deploy();
        });
        Then(
          "the deploy succeeds pinned to the latest published tag",
          async () => {
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
              deployed: { type: "skill", name: "tdd", version: FIXTURE_TAG },
            });
          },
        );
      },
    );

    Scenario(
      "I see the deployed skill back at its version (J02)",
      ({ Given, When, Then }) => {
        Given("I deployed the tdd skill to a registered repo", async () => {
          await register();
          const deployed = await deploy();
          expect(deployed.status).toBe(200);
        });
        When("I open that repo's deploy-state", async () => {
          response = await app.request(
            `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
          );
        });
        Then("I see the tdd skill at the tag it was deployed at", async () => {
          expect(response.status).toBe(200);
          const { primitives } = (await response.json()) as {
            primitives: Array<{ type: string; name: string; version: string }>;
          };
          expect(primitives).toEqual([
            { type: "skill", name: "tdd", version: FIXTURE_TAG },
          ]);
        });
      },
    );
  },
);
