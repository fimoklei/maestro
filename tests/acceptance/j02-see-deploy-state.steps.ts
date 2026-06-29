import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

const feature = await loadFeature(
  "tests/acceptance/j02-see-deploy-state.feature",
);

// Acceptance lane for J02: drives the real server API against temp repos (never
// a real project), with the Origin/Host guard disabled — these scenarios read
// like the job map, not like server internals. A repo is made visible by
// registering it through the same API a user would use.
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
  "  content_hash: sha256:abc",
  "",
].join("\n");

type DeployedPrimitive = { type: string; name: string; version: string };

describeFeature(
  feature,
  ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
    let workspace: string;
    let repo: string;
    let app: ReturnType<typeof buildApp>;
    let response: Response;

    BeforeEachScenario(async () => {
      workspace = await mkdtemp(join(tmpdir(), "maestro-j02-"));
      repo = await mkdtemp(join(tmpdir(), "maestro-j02-repo-"));
      app = buildApp(join(workspace, "config.json"));
    });

    AfterEachScenario(async () => {
      await rm(workspace, { recursive: true, force: true });
      await rm(repo, { recursive: true, force: true });
    });

    async function register(path: string) {
      await app.request("/api/registry/repos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path }),
      });
    }

    async function openDeployState() {
      response = await app.request(
        `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
      );
    }

    Scenario(
      "I see what is deployed in a repo, at which version",
      ({ Given, When, Then }) => {
        Given(
          "a registered repo with a skill deployed at tag v0.5.0",
          async () => {
            await writeFile(join(repo, "apm.lock.yaml"), skillLockfile, "utf8");
            await register(repo);
          },
        );
        When("I open that repo's deploy-state", openDeployState);
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
            // The version is a human tag, never the commit hash.
            expect(primitives[0]?.version).toMatch(/^v\d+\.\d+\.\d+$/);
          },
        );
      },
    );

    Scenario(
      "A repo with nothing deployed shows an honest empty state",
      ({ Given, When, Then }) => {
        Given("a registered repo with nothing deployed", async () => {
          await register(repo);
        });
        When("I open that repo's deploy-state", openDeployState);
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
      "A repo Maestro does not know is refused before any file is read",
      ({ Given, When, Then }) => {
        Given(
          "a repo that has a lockfile but was never registered",
          async () => {
            await writeFile(join(repo, "apm.lock.yaml"), skillLockfile, "utf8");
          },
        );
        When("I open that repo's deploy-state", openDeployState);
        Then("I am refused and none of its lockfile leaks back", async () => {
          expect(response.status).toBe(403);
          expect(JSON.stringify(await response.json())).not.toContain("v0.5.0");
        });
      },
    );

    Scenario(
      "A broken lockfile is surfaced as an error, never a blank list",
      ({ Given, When, Then }) => {
        Given("a registered repo whose lockfile is malformed", async () => {
          await writeFile(
            join(repo, "apm.lock.yaml"),
            "dependencies: not-a-list\n",
            "utf8",
          );
          await register(repo);
        });
        When("I open that repo's deploy-state", openDeployState);
        Then("I see a visible error instead of an empty list", async () => {
          expect(response.status).toBe(422);
          const body = (await response.json()) as { message: string };
          expect(body.message).toMatch(/\S/);
        });
      },
    );
  },
);
