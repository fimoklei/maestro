import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import {
  BrowseFilesystem,
  ConfigStore,
  ConnectInventory,
  InventoryReader,
  NodeFileSystem,
  Registry,
  readGitOriginUrl,
  resolveInventoryPath,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { expect } from "vitest";
import { initGitClone } from "../helpers/git-fixture";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubRemove } from "../helpers/stub-remove";

const feature = await loadFeature(
  "tests/acceptance/j11-connect-inventory.feature",
);

// Acceptance lane for J11: drives the real connect + inventory routes against a
// temp config dir (never the real ~/.maestro), with the Origin/Host guard
// disabled. The inventory path is read from the persisted config per request,
// so a connect made through the API is reflected by a later inventory read —
// no env, no restart.
function buildApp(configPath: string) {
  const fs = new NodeFileSystem();
  const store = new ConfigStore({ fs, configPath });
  const registry = new Registry({ fs, store });
  const inventory = new InventoryReader({
    fs,
    resolvePath: async () => resolveInventoryPath(await store.read(), {}),
  });
  const deployState = stubDeployState({ fs });
  return createApp({
    registry,
    inventory,
    connect: new ConnectInventory({ fs, store, originUrl: readGitOriginUrl }),
    deployState,
    deploy: stubDeploy({ inventory, registry }),
    remove: stubRemove({ registry }),
    drift: stubDrift({ registry }),
    resolveGlobalRoot: () => "/nonexistent-apm-root",
    // Rooted at the OS temp dir (not the real home) so the browsed-path
    // scenario can list this suite's own temp directories — the acceptance
    // lane never touches the real home, mirroring buildApp's config isolation.
    browse: new BrowseFilesystem({ fs, homeRoot: () => tmpdir() }),
    enforceOriginHost: false,
  });
}

function browseChildren(app: ReturnType<typeof buildApp>, path: string) {
  return app.request("/api/filesystem/children", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

async function writeSkill(root: string, name: string, description: string) {
  const skillDir = join(root, "skills", name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    "utf8",
  );
}

function connect(app: ReturnType<typeof buildApp>, path: string) {
  return app.request("/api/inventory/connect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

describeFeature(
  feature,
  ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
    let workspace: string;
    let clone: string;
    let app: ReturnType<typeof buildApp>;
    let response: Response;

    BeforeEachScenario(async () => {
      workspace = await mkdtemp(join(tmpdir(), "maestro-j11-"));
      clone = await mkdtemp(join(tmpdir(), "maestro-j11-clone-"));
      app = buildApp(join(workspace, "config.json"));
    });

    AfterEachScenario(async () => {
      await rm(workspace, { recursive: true, force: true });
      await rm(clone, { recursive: true, force: true });
    });

    Scenario(
      "I connect a local clone and the inventory lists its skills",
      ({ Given, When, Then, And }) => {
        Given("a cockpit with no inventory configured", async () => {
          const before = await app.request("/api/inventory/primitives");
          expect(before.status).toBe(409);
        });
        When("I connect a local clone that has a skills folder", async () => {
          await writeSkill(clone, "tdd", "TDD loop");
          await initGitClone(clone);
          response = await connect(app, clone);
        });
        Then("the connect succeeds", () => {
          expect(response.status).toBe(200);
        });
        And("the central inventory lists that clone's skills", async () => {
          const res = await app.request("/api/inventory/primitives");
          expect(res.status).toBe(200);
          expect(await res.json()).toEqual({
            primitives: [
              { type: "skill", name: "tdd", description: "TDD loop" },
            ],
          });
        });
      },
    );

    Scenario(
      "A directory that is not an inventory is refused",
      ({ Given, When, Then, And }) => {
        Given("a cockpit with no inventory configured", () => {});
        When("I connect a directory that has no skills folder", async () => {
          response = await connect(app, clone);
        });
        Then("the connect is rejected with a readable error", async () => {
          expect(response.status).toBe(422);
          const body = (await response.json()) as { message: string };
          expect(body.message).toMatch(/\S/);
        });
        And("the central inventory is still not configured", async () => {
          const res = await app.request("/api/inventory/primitives");
          expect(res.status).toBe(409);
        });
      },
    );

    Scenario(
      "A folder with skills but no usable git origin is refused",
      ({ Given, When, Then, And }) => {
        Given("a cockpit with no inventory configured", () => {});
        When(
          "I connect a folder that has skills but no usable git origin",
          async () => {
            await writeSkill(clone, "tdd", "TDD loop");
            response = await connect(app, clone);
          },
        );
        Then("the connect is rejected with a readable error", async () => {
          expect(response.status).toBe(422);
          const body = (await response.json()) as { message: string };
          expect(body.message).toMatch(/\S/);
        });
        And("the central inventory is still not configured", async () => {
          const res = await app.request("/api/inventory/primitives");
          expect(res.status).toBe(409);
        });
      },
    );

    Scenario(
      "I connect via a path found by browsing",
      ({ Given, When, Then, And }) => {
        Given("a cockpit with no inventory configured", async () => {
          const before = await app.request("/api/inventory/primitives");
          expect(before.status).toBe(409);
        });
        When(
          "I browse to the clone's parent directory and connect the listed clone",
          async () => {
            const parent = await mkdtemp(join(tmpdir(), "maestro-j11-parent-"));
            await writeSkill(join(parent, "agent-harness"), "tdd", "TDD loop");
            await initGitClone(join(parent, "agent-harness"));

            const browseRes = await browseChildren(app, parent);
            expect(browseRes.status).toBe(200);
            const { entries } = (await browseRes.json()) as {
              entries: { name: string; path: string }[];
            };
            const found = entries.find((e) => e.name === "agent-harness");
            expect(found).toBeDefined();

            response = await connect(app, found?.path ?? "");
          },
        );
        Then("the connect succeeds", () => {
          expect(response.status).toBe(200);
        });
        And("the central inventory lists that clone's skills", async () => {
          const res = await app.request("/api/inventory/primitives");
          expect(res.status).toBe(200);
          expect(await res.json()).toEqual({
            primitives: [
              { type: "skill", name: "tdd", description: "TDD loop" },
            ],
          });
        });
      },
    );
  },
);
