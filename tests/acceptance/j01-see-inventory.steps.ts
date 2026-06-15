import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDrift } from "../helpers/stub-drift";

const feature = await loadFeature("tests/acceptance/j01-see-inventory.feature");

// Acceptance lane for J01: drives the real server API against a temp
// agent-harness-shaped clone (never the real one), with the Origin/Host guard
// disabled — these scenarios read like the job map, not server internals.
function buildApp(configPath: string, inventoryPath: string | undefined) {
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
  return createApp({
    registry,
    inventory,
    deployState,
    deploy: stubDeploy({ inventory, registry }),
    drift: stubDrift({ registry }),
    resolveGlobalRoot: () => "/nonexistent-apm-root",
    enforceOriginHost: false,
  });
}

async function writeSkill(root: string, name: string, body: string) {
  const skillDir = join(root, "skills", name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), body, "utf8");
}

function skillFile(name: string, description: string) {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;
}

type Primitive = { type: string; name: string; description: string };

describeFeature(
  feature,
  ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
    let workspace: string;
    let inventory: string;
    let app: ReturnType<typeof buildApp>;
    let response: Response;

    BeforeEachScenario(async () => {
      workspace = await mkdtemp(join(tmpdir(), "maestro-j01-"));
      inventory = await mkdtemp(join(tmpdir(), "maestro-j01-inv-"));
    });

    AfterEachScenario(async () => {
      await rm(workspace, { recursive: true, force: true });
      await rm(inventory, { recursive: true, force: true });
    });

    async function open() {
      response = await app.request("/api/inventory/primitives");
    }

    Scenario("I see every central skill available", ({ Given, When, Then }) => {
      Given("a cockpit pointed at an inventory with two skills", async () => {
        await writeSkill(inventory, "tdd", skillFile("tdd", "TDD loop"));
        await writeSkill(
          inventory,
          "diagnose",
          skillFile("diagnose", "Diagnosis loop"),
        );
        app = buildApp(join(workspace, "config.json"), inventory);
      });
      When("I open the central inventory", open);
      Then("I see both skills with their names and descriptions", async () => {
        expect(response.status).toBe(200);
        const { primitives } = (await response.json()) as {
          primitives: Primitive[];
        };
        // Order-independent: the reader returns filesystem order, which is not
        // guaranteed across machines (see .claude/rules/testing.md — no reliance
        // on key/entry ordering).
        expect(
          [...primitives].sort((a, b) => a.name.localeCompare(b.name)),
        ).toEqual([
          { type: "skill", name: "diagnose", description: "Diagnosis loop" },
          { type: "skill", name: "tdd", description: "TDD loop" },
        ]);
      });
    });

    Scenario(
      "One broken skill does not hide the others",
      ({ Given, When, Then }) => {
        Given(
          "an inventory where one skill is broken and one is valid",
          async () => {
            // "broken" has a SKILL.md with no frontmatter at all.
            await writeSkill(inventory, "broken", "# broken\nno frontmatter\n");
            await writeSkill(inventory, "tdd", skillFile("tdd", "TDD loop"));
            app = buildApp(join(workspace, "config.json"), inventory);
          },
        );
        When("I open the central inventory", open);
        Then("I still see the valid skill", async () => {
          expect(response.status).toBe(200);
          const { primitives } = (await response.json()) as {
            primitives: Primitive[];
          };
          expect(primitives).toEqual([
            { type: "skill", name: "tdd", description: "TDD loop" },
          ]);
        });
      },
    );

    Scenario(
      "I am told clearly when no inventory is configured",
      ({ Given, When, Then }) => {
        Given("a cockpit with no inventory configured", () => {
          app = buildApp(join(workspace, "config.json"), undefined);
        });
        When("I open the central inventory", open);
        Then(
          'I see a clear "not configured" message instead of a blank list',
          async () => {
            expect(response.status).toBe(409);
            const body = (await response.json()) as { message: string };
            expect(body.message).toMatch(/\S/);
          },
        );
      },
    );
  },
);
