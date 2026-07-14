import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  type SupportedTool,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { expect } from "vitest";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDrift } from "../helpers/stub-drift";

const feature = await loadFeature(
  "tests/acceptance/j07-deploy-globally.feature",
);

// Acceptance lane for J07: drives the real server API to deploy globally, then
// reads the result back through the real global deploy-state endpoint. apm is
// faked (network/auth out of the fast loop), but writes the captured real
// lockfile into a sandbox user-scope root (never the real ~/.apm). The
// Origin/Host guard is disabled, as in the other acceptance journeys.
const FIXTURE_TAG = "v0.5.0";

const globalLockfile = [
  "lockfile_version: '1'",
  "apm_version: 0.16.0",
  "dependencies:",
  "- repo_url: fimoklei/agent-harness",
  "  host: github.com",
  "  resolved_commit: ec491f154c9d5c9a6c5db56d1946c4c34f3899bb",
  `  resolved_ref: ${FIXTURE_TAG}`,
  "  virtual_path: skills/tdd",
  "  is_virtual: true",
  "  package_type: claude_skill",
  "  deployed_files:",
  "  - .claude/skills/tdd",
  "  - .agents/skills/tdd",
  "  content_hash: sha256:abc",
  "",
].join("\n");

type DeployedPrimitive = { type: string; name: string; version: string };

describeFeature(
  feature,
  ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
    let workspace: string;
    let harness: string;
    let apmRoot: string;
    let diverged: boolean;
    // The tools the machine has, and the tokens apm was told to target. A
    // fake presence port drives the first; the deploy captures the second so a
    // scenario can assert the `-t` scoping (ADR-0011, #131).
    let presentTools: SupportedTool[];
    let targetedTools: readonly SupportedTool[] | undefined;
    let app: ReturnType<typeof createApp>;
    let response: Response;

    BeforeEachScenario(async () => {
      workspace = await mkdtemp(join(tmpdir(), "maestro-j07-"));
      harness = join(workspace, "harness");
      apmRoot = join(workspace, ".apm");
      await mkdir(apmRoot, { recursive: true });
      diverged = false;
      presentTools = ["claude", "codex"];
      targetedTools = undefined;

      const fs = new NodeFileSystem();
      const registry = new Registry({
        fs,
        store: new ConfigStore({
          fs,
          configPath: join(workspace, "config.json"),
        }),
      });
      const inventory = new InventoryReader({ fs, resolvePath: () => harness });
      const deployState = new DeployStateReader({ fs });
      const deploy = new DeploySkill({
        inventory,
        registry,
        apm: {
          resolveLatestTag: async () => ({ ok: true, tag: FIXTURE_TAG }),
          // A global install lands the lockfile in the user-scope root, exactly
          // where the global deploy-state endpoint then reads it.
          deploySkill: async ({ target, tools }) => {
            if (target.kind !== "global") {
              throw new Error("this journey deploys globally only");
            }
            targetedTools = tools;
            await writeFile(
              join(apmRoot, "apm.lock.yaml"),
              globalLockfile,
              "utf8",
            );
          },
        },
        inventoryGit: {
          skillExistsAtTag: async () => true,
          skillDivergesFromTag: async () => diverged,
        },
        deployedContent: { classify: async () => "not-deployed" },
        toolPresence: { detectGlobalTools: async () => presentTools },
        inventoryOriginUrl: async () =>
          "git@github.com:fimoklei/agent-harness.git",
        canonicalPath: (path) => fs.realpath(path),
      });
      app = createApp({
        registry,
        inventory,
        deployState,
        deploy,
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

    async function seedInventory() {
      await mkdir(join(harness, "skills", "tdd"), { recursive: true });
      await writeFile(
        join(harness, "skills", "tdd", "SKILL.md"),
        "---\nname: tdd\ndescription: Test-driven development\n---\n",
        "utf8",
      );
    }

    function deployGlobally() {
      return app.request("/api/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "skill",
          name: "tdd",
          target: { kind: "global" },
        }),
      });
    }

    async function globalPrimitives() {
      const res = await app.request("/api/deploy-state/global");
      const { primitives } = (await res.json()) as {
        primitives: DeployedPrimitive[];
      };
      return primitives;
    }

    Scenario(
      "I deploy a skill globally and see it in my baseline, with no repo registered",
      ({ Given, And, When, Then }) => {
        Given('the central inventory has the skill "tdd"', () =>
          seedInventory(),
        );
        And("both Claude Code and Codex are installed on this machine", () => {
          presentTools = ["claude", "codex"];
        });
        And("no repo is registered", () => {
          // The registry starts empty; global needs no entry in it.
        });
        When('I deploy "tdd" globally', async () => {
          response = await deployGlobally();
        });
        Then("the global deploy succeeds at the latest tag", async () => {
          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({
            deployed: { type: "skill", name: "tdd", version: FIXTURE_TAG },
          });
        });
        And('apm is told to target "claude,codex"', () => {
          expect(targetedTools).toEqual(["claude", "codex"]);
        });
        And(
          'I see "tdd" in the global deploy-state at that version',
          async () => {
            expect(await globalPrimitives()).toEqual([
              { type: "skill", name: "tdd", version: FIXTURE_TAG },
            ]);
          },
        );
      },
    );

    Scenario(
      "A single-tool machine deploys to only that tool, with no dead directory",
      ({ Given, And, When, Then }) => {
        Given('the central inventory has the skill "tdd"', () =>
          seedInventory(),
        );
        And("only Claude Code is installed on this machine", () => {
          presentTools = ["claude"];
        });
        When('I deploy "tdd" globally', async () => {
          response = await deployGlobally();
        });
        Then("the global deploy succeeds at the latest tag", async () => {
          expect(response.status).toBe(200);
        });
        And('apm is told to target "claude"', () => {
          // -t claude only: apm writes no dead .agents/ tree (ADR-0011).
          expect(targetedTools).toEqual(["claude"]);
        });
      },
    );

    Scenario(
      "A machine with no supported tool refuses the global deploy",
      ({ Given, And, When, Then }) => {
        Given('the central inventory has the skill "tdd"', () =>
          seedInventory(),
        );
        And("no supported tool is installed on this machine", () => {
          presentTools = [];
        });
        When('I deploy "tdd" globally', async () => {
          response = await deployGlobally();
        });
        Then(
          "the global deploy is refused because no supported tool was found",
          async () => {
            expect(response.status).toBe(409);
            const body = (await response.json()) as { message: string };
            expect(body.message).toMatch(/no supported tool/i);
          },
        );
        And("the global deploy-state stays empty", async () => {
          expect(await globalPrimitives()).toEqual([]);
        });
      },
    );

    Scenario(
      "A global deploy is refused when my local skill has diverged from its tag",
      ({ Given, But, When, Then, And }) => {
        Given('the central inventory has the skill "tdd"', () =>
          seedInventory(),
        );
        But('my local copy of "tdd" has diverged from its latest tag', () => {
          diverged = true;
        });
        When('I deploy "tdd" globally', async () => {
          response = await deployGlobally();
        });
        Then(
          "the global deploy is refused with a tag-and-push message",
          async () => {
            expect(response.status).toBe(409);
            const body = (await response.json()) as { message: string };
            expect(body.message).toMatch(/tag/i);
          },
        );
        And("the global deploy-state stays empty", async () => {
          expect(await globalPrimitives()).toEqual([]);
        });
      },
    );
  },
);
