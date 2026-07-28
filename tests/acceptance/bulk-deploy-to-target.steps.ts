import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import {
  type BulkDeployReport,
  ConfigStore,
  DeploySkill,
  GlobalDeployStateReader,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { expect } from "vitest";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDrift } from "../helpers/stub-drift";
import { stubRemove } from "../helpers/stub-remove";

const feature = await loadFeature(
  "tests/acceptance/bulk-deploy-to-target.feature",
);

// Acceptance lane for #292: drives the real bulk-deploy API against the real
// server, one guarded DeploySkill per staged skill, then reads the result back
// through the real global deploy-state endpoint. apm is faked (network/auth out
// of the fast loop) but accumulates a captured real lockfile into a sandbox
// user-scope root, exactly where the deploy-state read then finds it. Modelled
// on j07-deploy-globally.
const FIXTURE_TAG = "v0.5.0";

// Builds a user-scope lockfile carrying one claude_skill dependency per name,
// as apm accumulates across successive global installs.
function globalLockfile(names: string[]): string {
  const header = [
    "lockfile_version: '1'",
    "apm_version: 0.16.0",
    "dependencies:",
  ];
  const deps = names.flatMap((name) => [
    "- repo_url: fimoklei/agent-harness",
    "  host: github.com",
    "  resolved_commit: ec491f154c9d5c9a6c5db56d1946c4c34f3899bb",
    `  resolved_ref: ${FIXTURE_TAG}`,
    `  virtual_path: skills/${name}`,
    "  is_virtual: true",
    "  package_type: claude_skill",
    "  deployed_files:",
    `  - .claude/skills/${name}`,
    `  - .agents/skills/${name}`,
    "  content_hash: sha256:abc",
  ]);
  return [...header, ...deps, ""].join("\n");
}

type DeployedPrimitive = { type: string; name: string; version: string };

describeFeature(
  feature,
  ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
    let workspace: string;
    let harness: string;
    let apmRoot: string;
    let deployedNames: string[];
    let failNames: Set<string>;
    let divergedNames: Set<string>;
    let app: ReturnType<typeof createApp>;
    let report: BulkDeployReport;

    BeforeEachScenario(async () => {
      workspace = await mkdtemp(join(tmpdir(), "maestro-bulk-acc-"));
      harness = join(workspace, "harness");
      apmRoot = join(workspace, ".apm");
      await mkdir(apmRoot, { recursive: true });
      deployedNames = [];
      failNames = new Set();
      divergedNames = new Set();

      const fs = new NodeFileSystem();
      const registry = new Registry({
        fs,
        store: new ConfigStore({
          fs,
          configPath: join(workspace, "config.json"),
        }),
      });
      const inventory = new InventoryReader({ fs, resolvePath: () => harness });
      const deployState = new GlobalDeployStateReader({
        fs,
        toolPresence: { detectGlobalTools: async () => ["claude", "codex"] },
      });
      const deploy = new DeploySkill({
        inventory,
        registry,
        apm: {
          resolveLatestTag: async () => ({ ok: true, tag: FIXTURE_TAG }),
          deploySkill: async ({ ref }) => {
            const name = ref.match(/\/skills\/([^#]+)#/)?.[1] ?? "";
            if (failNames.has(name)) {
              throw new Error("apm install failed: token in stderr");
            }
            deployedNames.push(name);
            await writeFile(
              join(apmRoot, "apm.lock.yaml"),
              globalLockfile(deployedNames),
              "utf8",
            );
            return { ok: true as const };
          },
        },
        inventoryGit: {
          skillExistsAtTag: async () => true,
          skillDivergesFromTag: async () => false,
        },
        deployedContent: {
          classify: async ({ name }) =>
            divergedNames.has(name) ? "diverged" : "not-deployed",
        },
        deployedCleanup: { removeSkillTargets: async () => undefined },
        toolPresence: { detectGlobalTools: async () => ["claude", "codex"] },
        inventoryOriginUrl: async () =>
          "git@github.com:fimoklei/agent-harness.git",
        canonicalPath: (path) => fs.realpath(path),
      });
      app = createApp({
        registry,
        inventory,
        deployState,
        deploy,
        remove: stubRemove({ registry }),
        drift: stubDrift({ registry }),
        resolveGlobalRoot: () => apmRoot,
        connect: stubConnect(),
        browse: stubBrowse(),
        enforceOriginHost: false,
      });
    });

    AfterEachScenario(async () => {
      await rm(workspace, { recursive: true, force: true });
    });

    async function seedInventory(names: string[]) {
      for (const name of names) {
        await mkdir(join(harness, "skills", name), { recursive: true });
        await writeFile(
          join(harness, "skills", name, "SKILL.md"),
          `---\nname: ${name}\ndescription: ${name} skill\n---\n`,
          "utf8",
        );
      }
    }

    async function bulkDeployGlobally(names: string[]) {
      const res = await app.request("/api/deploy/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ names, target: { kind: "global" } }),
      });
      expect(res.status).toBe(200);
      return (await res.json()) as BulkDeployReport;
    }

    async function globalPrimitives() {
      const res = await app.request("/api/deploy-state/global");
      const { tools } = (await res.json()) as {
        tools: { tool: string; primitives: DeployedPrimitive[] }[];
      };
      const seen = new Set<string>();
      const flat: DeployedPrimitive[] = [];
      for (const group of tools) {
        for (const primitive of group.primitives) {
          const key = `${primitive.name}@${primitive.version}`;
          if (!seen.has(key)) {
            seen.add(key);
            flat.push(primitive);
          }
        }
      }
      return flat;
    }

    Scenario(
      "I bulk-deploy several staged skills globally and see them in my baseline",
      ({ Given, And, When, Then }) => {
        Given('the central inventory has the skills "tdd" and "review"', () =>
          seedInventory(["tdd", "review"]),
        );
        And("both Claude Code and Codex are installed on this machine", () => {
          // The BeforeEachScenario presence port already reports both.
        });
        When('I bulk-deploy "tdd" and "review" globally', async () => {
          report = await bulkDeployGlobally(["tdd", "review"]);
        });
        Then(
          "the bulk deploy reports both as deployed at the latest tag",
          () => {
            expect(report.deployed).toEqual([
              { name: "tdd", version: FIXTURE_TAG },
              { name: "review", version: FIXTURE_TAG },
            ]);
            expect(report.attention).toEqual([]);
            expect(report.failed).toEqual([]);
          },
        );
        And("I see both skills in the global deploy-state", async () => {
          expect(await globalPrimitives()).toEqual([
            { type: "skill", name: "tdd", version: FIXTURE_TAG },
            { type: "skill", name: "review", version: FIXTURE_TAG },
          ]);
        });
      },
    );

    Scenario(
      "A failure mid-batch does not abort the rest",
      ({ Given, And, But, When, Then }) => {
        Given('the central inventory has the skills "tdd" and "review"', () =>
          seedInventory(["tdd", "review"]),
        );
        And(
          "both Claude Code and Codex are installed on this machine",
          () => {},
        );
        But('deploying "review" fails', () => {
          failNames.add("review");
        });
        When('I bulk-deploy "tdd" and "review" globally', async () => {
          report = await bulkDeployGlobally(["tdd", "review"]);
        });
        Then('the report shows "tdd" deployed and "review" failed', () => {
          expect(report.deployed).toEqual([
            { name: "tdd", version: FIXTURE_TAG },
          ]);
          expect(report.failed).toEqual([
            { error: "deploy-failed", names: ["review"] },
          ]);
          // No raw apm output (which may carry a token) leaks into the report.
          expect(JSON.stringify(report)).not.toContain("token in stderr");
        });
        And('I still see "tdd" in the global deploy-state', async () => {
          expect(await globalPrimitives()).toEqual([
            { type: "skill", name: "tdd", version: FIXTURE_TAG },
          ]);
        });
      },
    );

    Scenario(
      "A content-diverged skill is flagged for attention, never overwritten",
      ({ Given, And, But, When, Then }) => {
        Given('the central inventory has the skills "tdd" and "review"', () =>
          seedInventory(["tdd", "review"]),
        );
        And(
          "both Claude Code and Codex are installed on this machine",
          () => {},
        );
        But(
          'the deployed copy of "review" has diverged from its lockfile',
          () => {
            divergedNames.add("review");
          },
        );
        When('I bulk-deploy "tdd" and "review" globally', async () => {
          report = await bulkDeployGlobally(["tdd", "review"]);
        });
        Then(
          'the report shows "tdd" deployed and "review" needing attention',
          () => {
            expect(report.deployed).toEqual([
              { name: "tdd", version: FIXTURE_TAG },
            ]);
            expect(report.attention).toEqual([
              { name: "review", error: "deployed-diverged-from-lock" },
            ]);
            expect(report.failed).toEqual([]);
          },
        );
      },
    );
  },
);
