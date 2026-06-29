import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import {
  ConfigStore,
  ConnectInventory,
  DeployStateReader,
  InventoryReader,
  NodeFileSystem,
  Registry,
  resolveInventoryPath,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { expect } from "vitest";
import { stubBrowse } from "../helpers/stub-browse";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDrift } from "../helpers/stub-drift";

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
  const deployState = new DeployStateReader({ fs });
  return createApp({
    registry,
    inventory,
    connect: new ConnectInventory({ fs, store }),
    deployState,
    deploy: stubDeploy({ inventory, registry }),
    drift: stubDrift({ registry }),
    resolveGlobalRoot: () => "/nonexistent-apm-root",
    browse: stubBrowse(),
    enforceOriginHost: false,
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
  },
);
