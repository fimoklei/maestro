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

const feature = await loadFeature(
  "tests/acceptance/j03-see-global-deploy-state.feature",
);

// Acceptance lane for J03: drives the real server API against a sandbox apm
// user-scope root (never the real ~/.apm), with the Origin/Host guard disabled.
// The server resolves the global location itself; the sandbox is injected as the
// resolveGlobalRoot dependency, exactly the seam the slice prescribes.
function buildApp(configPath: string, apmRoot: string) {
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
    resolveGlobalRoot: () => apmRoot,
    enforceOriginHost: false,
  });
}

const skillLockfile = [
  "lockfile_version: '1'",
  "apm_version: 0.16.0",
  "dependencies:",
  "- repo_url: fimoklei/agent-harness",
  "  host: github.com",
  "  resolved_commit: ec491f154c9d5c9a6c5db56d1946c4c34f3899bb",
  "  resolved_ref: v0.5.0",
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
    let apmRoot: string;
    let app: ReturnType<typeof buildApp>;
    let response: Response;

    BeforeEachScenario(async () => {
      workspace = await mkdtemp(join(tmpdir(), "maestro-j03-"));
      apmRoot = join(workspace, ".apm");
      await mkdir(apmRoot, { recursive: true });
      app = buildApp(join(workspace, "config.json"), apmRoot);
    });

    AfterEachScenario(async () => {
      await rm(workspace, { recursive: true, force: true });
    });

    async function openGlobal(query = "") {
      response = await app.request(`/api/deploy-state/global${query}`);
    }

    Scenario(
      "I see what is deployed globally, at which version",
      ({ Given, When, Then }) => {
        Given("a skill deployed globally at tag v0.5.0", async () => {
          await writeFile(
            join(apmRoot, "apm.lock.yaml"),
            skillLockfile,
            "utf8",
          );
        });
        When("I open the global deploy-state", () => openGlobal());
        Then(
          "I see the skill with its name and the human tag version",
          async () => {
            expect(response.status).toBe(200);
            const { primitives } = (await response.json()) as {
              primitives: DeployedPrimitive[];
            };
            expect(primitives).toEqual([
              { type: "skill", name: "tdd", version: "v0.5.0" },
            ]);
            expect(primitives[0]?.version).toMatch(/^v\d+\.\d+\.\d+$/);
          },
        );
      },
    );

    Scenario(
      "Nothing deployed globally shows an honest empty state",
      ({ Given, When, Then }) => {
        Given("nothing deployed globally", async () => {
          // No apm.lock.yaml in the user-scope root: nothing deployed yet.
        });
        When("I open the global deploy-state", () => openGlobal());
        Then("I see an empty list, not an error", async () => {
          expect(response.status).toBe(200);
          const { primitives } = (await response.json()) as {
            primitives: DeployedPrimitive[];
          };
          expect(primitives).toEqual([]);
        });
      },
    );

    Scenario(
      "A broken global lockfile is surfaced as an error, never a blank list",
      ({ Given, When, Then }) => {
        Given("a malformed global lockfile", async () => {
          await writeFile(
            join(apmRoot, "apm.lock.yaml"),
            "dependencies: not-a-list\n",
            "utf8",
          );
        });
        When("I open the global deploy-state", () => openGlobal());
        Then("I see a visible error instead of an empty list", async () => {
          expect(response.status).toBe(422);
          const body = (await response.json()) as { message: string };
          expect(body.message).toMatch(/\S/);
        });
      },
    );

    Scenario(
      "The global read uses the server's own location, not a client path",
      ({ Given, When, Then }) => {
        Given("a skill deployed globally at tag v0.5.0", async () => {
          await writeFile(
            join(apmRoot, "apm.lock.yaml"),
            skillLockfile,
            "utf8",
          );
        });
        When(
          "I open the global deploy-state with a bogus repo path in the query",
          () => openGlobal("?repo=/etc/passwd"),
        );
        Then(
          "I still see the skill, because the server ignored the client path",
          async () => {
            expect(response.status).toBe(200);
            const { primitives } = (await response.json()) as {
              primitives: DeployedPrimitive[];
            };
            expect(primitives).toEqual([
              { type: "skill", name: "tdd", version: "v0.5.0" },
            ]);
          },
        );
      },
    );
  },
);
