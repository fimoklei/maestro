import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import {
  ConfigStore,
  GlobalDeployStateReader,
  InventoryReader,
  NodeFileSystem,
  Registry,
  type SupportedTool,
  type ToolPresencePort,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { expect } from "vitest";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDrift } from "../helpers/stub-drift";

const feature = await loadFeature(
  "tests/acceptance/j03-see-global-deploy-state.feature",
);

// Acceptance lane for J03: drives the real server API against a sandbox apm
// user-scope root (never the real ~/.apm), with the Origin/Host guard disabled.
// The server resolves the global location itself; the sandbox is injected as the
// resolveGlobalRoot dependency, and a fake presence port stands in for the
// live filesystem probe so a scenario declares which tools the machine has.
function buildApp(
  configPath: string,
  apmRoot: string,
  presence: ToolPresencePort,
) {
  const fs = new NodeFileSystem();
  const registry = new Registry({
    fs,
    store: new ConfigStore({ fs, configPath }),
  });
  const inventory = new InventoryReader({ fs, resolvePath: () => undefined });
  const deployState = new GlobalDeployStateReader({
    fs,
    toolPresence: presence,
  });
  return createApp({
    registry,
    inventory,
    deployState,
    deploy: stubDeploy({ inventory, registry }),
    drift: stubDrift({ registry }),
    resolveGlobalRoot: () => apmRoot,
    connect: stubConnect(),
    browse: stubBrowse(),
    enforceOriginHost: false,
  });
}

function fakePresence(tools: SupportedTool[]): ToolPresencePort {
  return { detectGlobalTools: async () => tools };
}

// A tag-pinned skill entry apm writes; deployedFiles decides which tool copies
// it carries (apm-driver.md).
function skillEntry(
  name: string,
  ref: string,
  deployedFiles: string[],
): string {
  const files = deployedFiles.map((file) => `  - ${file}`).join("\n");
  return [
    "- repo_url: fimoklei/agent-harness",
    "  host: github.com",
    "  resolved_commit: ec491f154c9d5c9a6c5db56d1946c4c34f3899bb",
    `  resolved_ref: ${ref}`,
    `  virtual_path: skills/${name}`,
    "  is_virtual: true",
    "  package_type: claude_skill",
    "  deployed_files:",
    files,
    "  content_hash: sha256:abc",
    "",
  ].join("\n");
}

function lockfile(entries: string): string {
  return [
    "lockfile_version: '1'",
    "apm_version: 0.20.0",
    "dependencies:",
    entries,
  ].join("\n");
}

type ToolDeployState = {
  tool: string;
  primitives: { type: string; name: string; version: string }[];
};

describeFeature(
  feature,
  ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
    let workspace: string;
    let apmRoot: string;
    let detected: SupportedTool[];
    let response: Response;
    // The body is read once (a Response body is single-use) and cached so several
    // Then/And steps can assert against it.
    let payload: { tools?: ToolDeployState[]; message?: string };

    BeforeEachScenario(async () => {
      workspace = await mkdtemp(join(tmpdir(), "maestro-j03-"));
      apmRoot = join(workspace, ".apm");
      await mkdir(apmRoot, { recursive: true });
      detected = [];
    });

    AfterEachScenario(async () => {
      await rm(workspace, { recursive: true, force: true });
    });

    async function writeLockfile(contents: string) {
      await writeFile(join(apmRoot, "apm.lock.yaml"), contents, "utf8");
    }

    async function openGlobal(query = "") {
      const app = buildApp(
        join(workspace, "config.json"),
        apmRoot,
        fakePresence(detected),
      );
      response = await app.request(`/api/deploy-state/global${query}`);
      payload = (await response.json()) as {
        tools?: ToolDeployState[];
        message?: string;
      };
    }

    function toolsOf(): ToolDeployState[] {
      return payload.tools ?? [];
    }

    function groupFor(
      tools: ToolDeployState[],
      tool: string,
    ): ToolDeployState | undefined {
      return tools.find((group) => group.tool === tool);
    }

    Scenario(
      "A single-tool machine groups its skills under only that tool",
      ({ Given, And, When, Then }) => {
        Given("only Claude Code is installed on this machine", () => {
          detected = ["claude"];
        });
        And("a skill deployed globally at tag v0.5.1", async () => {
          await writeLockfile(
            lockfile(
              skillEntry("tdd", "v0.5.1", [
                ".claude/skills/tdd",
                ".claude/skills/tdd/SKILL.md",
              ]),
            ),
          );
        });
        When("I open the global deploy-state", () => openGlobal());
        Then(
          "I see the skill under Claude at its human tag version",
          async () => {
            expect(response.status).toBe(200);
            const claude = groupFor(toolsOf(), "claude");
            expect(claude?.primitives).toEqual([
              { type: "skill", name: "tdd", version: "v0.5.1" },
            ]);
          },
        );
        And("Codex is not listed at all", async () => {
          expect(groupFor(toolsOf(), "codex")).toBeUndefined();
        });
      },
    );

    Scenario(
      "A two-tool machine attributes each skill to the tool it was deployed for",
      ({ Given, And, When, Then }) => {
        Given(
          "both Claude Code and Codex are installed on this machine",
          () => {
            detected = ["claude", "codex"];
          },
        );
        And(
          "a two-tool skill and a Claude-only skill deployed globally",
          async () => {
            await writeLockfile(
              lockfile(
                skillEntry("tdd", "v0.5.1", [
                  ".claude/skills/tdd",
                  ".agents/skills/tdd",
                ]) +
                  skillEntry("diagnose", "v1.2.0", [".claude/skills/diagnose"]),
              ),
            );
          },
        );
        When("I open the global deploy-state", () => openGlobal());
        Then("the two-tool skill appears under both tools", async () => {
          const tools = toolsOf();
          expect(groupFor(tools, "claude")?.primitives).toContainEqual({
            type: "skill",
            name: "tdd",
            version: "v0.5.1",
          });
          expect(groupFor(tools, "codex")?.primitives).toContainEqual({
            type: "skill",
            name: "tdd",
            version: "v0.5.1",
          });
        });
        And(
          "the Claude-only skill appears under Claude but never under Codex",
          async () => {
            const tools = toolsOf();
            const diagnose = {
              type: "skill",
              name: "diagnose",
              version: "v1.2.0",
            };
            expect(groupFor(tools, "claude")?.primitives).toContainEqual(
              diagnose,
            );
            expect(groupFor(tools, "codex")?.primitives).not.toContainEqual(
              diagnose,
            );
          },
        );
      },
    );

    Scenario(
      "A detected tool with nothing deployed shows as an empty group",
      ({ Given, And, When, Then }) => {
        Given(
          "both Claude Code and Codex are installed on this machine",
          () => {
            detected = ["claude", "codex"];
          },
        );
        And("a skill deployed globally at tag v0.5.1", async () => {
          await writeLockfile(
            lockfile(skillEntry("tdd", "v0.5.1", [".claude/skills/tdd"])),
          );
        });
        When("I open the global deploy-state", () => openGlobal());
        Then("I see Codex listed as a recognised but empty group", async () => {
          expect(response.status).toBe(200);
          expect(groupFor(toolsOf(), "codex")).toEqual({
            tool: "codex",
            primitives: [],
          });
        });
      },
    );

    Scenario(
      "Nothing deployed globally shows an honest empty state per tool",
      ({ Given, And, When, Then }) => {
        Given("only Claude Code is installed on this machine", () => {
          detected = ["claude"];
        });
        And("nothing deployed globally", async () => {
          // No apm.lock.yaml in the user-scope root: nothing deployed yet.
        });
        When("I open the global deploy-state", () => openGlobal());
        Then("I see Claude as an empty group, not an error", async () => {
          expect(response.status).toBe(200);
          expect(toolsOf()).toEqual([{ tool: "claude", primitives: [] }]);
        });
      },
    );

    Scenario(
      "A broken global lockfile is surfaced as an error, never a blank list",
      ({ Given, And, When, Then }) => {
        Given("only Claude Code is installed on this machine", () => {
          detected = ["claude"];
        });
        And("a malformed global lockfile", async () => {
          await writeLockfile("dependencies: not-a-list\n");
        });
        When("I open the global deploy-state", () => openGlobal());
        Then("I see a visible error instead of an empty list", () => {
          expect(response.status).toBe(422);
          expect(payload.message).toMatch(/\S/);
        });
      },
    );

    Scenario(
      "The global read uses the server's own location, not a client path",
      ({ Given, And, When, Then }) => {
        Given("only Claude Code is installed on this machine", () => {
          detected = ["claude"];
        });
        And("a skill deployed globally at tag v0.5.1", async () => {
          await writeLockfile(
            lockfile(skillEntry("tdd", "v0.5.1", [".claude/skills/tdd"])),
          );
        });
        When(
          "I open the global deploy-state with a bogus repo path in the query",
          () => openGlobal("?repo=/etc/passwd"),
        );
        Then(
          "I still see the skill under Claude, because the server ignored the client path",
          async () => {
            expect(response.status).toBe(200);
            expect(groupFor(toolsOf(), "claude")?.primitives).toEqual([
              { type: "skill", name: "tdd", version: "v0.5.1" },
            ]);
          },
        );
      },
    );
  },
);
