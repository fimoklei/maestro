import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import {
  ConfigStore,
  type DeployedContentState,
  DeployedLocation,
  DeployedRefAdapter,
  InventoryReader,
  NodeFileSystem,
  Registry,
  RemoveDeployedSkill,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { expect } from "vitest";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";

const feature = await loadFeature(
  "tests/acceptance/remove-deployed-skill.feature",
);

// Acceptance lane: drives the real server API against a temp repo, with the
// Origin/Host guard disabled. Only apm is faked — and it is faked faithfully:
// a confirmed removal rewrites the repo's lockfile exactly as apm does,
// including deleting the file rather than emptying it when the last dependency
// goes (docs/apm-behavior.md § Remove). Deploy-state is then read back through
// the same route a user's screen reads, so "the row disappears" is asserted end
// to end rather than assumed.

type DeployedPrimitive = { type: string; name: string; version: string };

const lockfileFor = (names: string[]) =>
  [
    "lockfile_version: '1'",
    "dependencies:",
    ...names.flatMap((name) => [
      "- repo_url: fimoklei/agent-harness",
      "  host: github.com",
      "  resolved_ref: v0.5.1",
      `  virtual_path: skills/${name}`,
      "  package_type: claude_skill",
    ]),
    "",
  ].join("\n");

describeFeature(
  feature,
  ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
    let workspace: string;
    let repo: string;
    let app: ReturnType<typeof buildApp>;
    let response: Response;
    let removeCalls: string[];
    let apmConfirms: boolean;
    // What the destination guard finds on the deployed copy. apm deletes an
    // edited file with no warning, so this is what stands between the removal
    // and lost work.
    let deployedState: DeployedContentState;

    // The skills apm believes are installed in the repo. Kept beside the
    // lockfile the fake rewrites, so a removal shows up in the deploy-state read.
    let deployed: string[];

    function buildApp(configPath: string) {
      const fs = new NodeFileSystem();
      const registry = new Registry({
        fs,
        store: new ConfigStore({ fs, configPath }),
      });
      const inventory = new InventoryReader({
        fs,
        resolvePath: () => undefined,
      });
      const remove = new RemoveDeployedSkill({
        registry,
        deployedRef: new DeployedRefAdapter({
          fs,
          location: new DeployedLocation({}),
        }),
        deployedContent: { classify: async () => deployedState },
        apm: {
          removeSkill: async ({ ref }) => {
            removeCalls.push(ref);
            if (!apmConfirms) {
              return { ok: false };
            }
            deployed = deployed.filter(
              (name) => !ref.includes(`/skills/${name}#`),
            );
            await writeLockfile();
            return { ok: true };
          },
        },
        canonicalPath: (path) => fs.realpath(path),
      });
      return createApp({
        registry,
        inventory,
        deployState: stubDeployState({ fs }),
        deploy: stubDeploy({ inventory, registry }),
        remove,
        drift: stubDrift({ registry }),
        resolveGlobalRoot: () => "/nonexistent-apm-root",
        connect: stubConnect(),
        browse: stubBrowse(),
        enforceOriginHost: false,
      });
    }

    // apm deletes the lockfile when its last dependency goes, rather than
    // rewriting it with an empty list — an absent file must read as nothing
    // deployed, never as an error.
    async function writeLockfile() {
      const path = join(repo, "apm.lock.yaml");
      if (deployed.length === 0) {
        await unlink(path).catch(() => undefined);
        return;
      }
      await writeFile(path, lockfileFor(deployed), "utf8");
    }

    BeforeEachScenario(async () => {
      workspace = await mkdtemp(join(tmpdir(), "maestro-remove-"));
      repo = await mkdtemp(join(tmpdir(), "maestro-remove-repo-"));
      removeCalls = [];
      apmConfirms = true;
      deployedState = "clean";
      deployed = [];
      app = buildApp(join(workspace, "config.json"));
    });

    AfterEachScenario(async () => {
      await rm(workspace, { recursive: true, force: true });
      await rm(repo, { recursive: true, force: true });
    });

    async function register() {
      await app.request("/api/registry/repos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: repo }),
      });
    }

    async function deploySkills(names: string[]) {
      deployed = names;
      await writeLockfile();
    }

    async function removeSkill(name: string) {
      response = await app.request("/api/deploy/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "skill",
          name,
          target: { kind: "repo", repoPath: repo },
        }),
      });
    }

    // The question the confirmation asks before the user commits: what would
    // this removal destroy?
    async function preflightSkill(name: string) {
      response = await app.request("/api/deploy/remove/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "skill",
          name,
          target: { kind: "repo", repoPath: repo },
        }),
      });
    }

    async function readDeployState(): Promise<DeployedPrimitive[]> {
      const state = await app.request(
        `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
      );
      expect(state.status).toBe(200);
      const { primitives } = (await state.json()) as {
        primitives: DeployedPrimitive[];
      };
      return primitives;
    }

    Scenario(
      "I remove a skill and the repo stops listing it",
      ({ Given, When, Then, And }) => {
        Given('a registered repo with "tdd" and "jobs" deployed', async () => {
          await deploySkills(["tdd", "jobs"]);
          await register();
        });
        When('I remove "tdd" from that repo', () => removeSkill("tdd"));
        Then("the removal is confirmed", async () => {
          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({
            removed: { type: "skill", name: "tdd" },
          });
        });
        And('that repo\'s deploy-state lists only "jobs"', async () => {
          expect((await readDeployState()).map((p) => p.name)).toEqual([
            "jobs",
          ]);
        });
      },
    );

    Scenario(
      "Removing the last skill leaves an honestly empty repo",
      ({ Given, When, Then, And }) => {
        Given('a registered repo with only "tdd" deployed', async () => {
          await deploySkills(["tdd"]);
          await register();
        });
        When('I remove "tdd" from that repo', () => removeSkill("tdd"));
        Then("the removal is confirmed", () => {
          expect(response.status).toBe(200);
        });
        And("that repo's deploy-state is empty, not an error", async () => {
          expect(await readDeployState()).toEqual([]);
        });
      },
    );

    Scenario(
      "A repo Maestro does not know is refused before anything is touched",
      ({ Given, When, Then }) => {
        Given(
          'a repo with "tdd" deployed that was never registered',
          async () => {
            await deploySkills(["tdd"]);
          },
        );
        When('I remove "tdd" from that repo', () => removeSkill("tdd"));
        Then("I am refused and apm is never asked to remove anything", () => {
          expect(response.status).toBe(403);
          expect(removeCalls).toEqual([]);
        });
      },
    );

    Scenario(
      "A removal apm cannot confirm is reported as a failure",
      ({ Given, But, When, Then, And }) => {
        Given('a registered repo with only "tdd" deployed', async () => {
          await deploySkills(["tdd"]);
          await register();
        });
        But("apm will not confirm the removal", () => {
          apmConfirms = false;
        });
        When('I remove "tdd" from that repo', () => removeSkill("tdd"));
        Then("the removal is reported as failed", async () => {
          expect(response.status).toBe(502);
          const body = (await response.json()) as { message: string };
          expect(body.message).toMatch(/\S/);
        });
        And('that repo\'s deploy-state still lists "tdd"', async () => {
          expect((await readDeployState()).map((p) => p.name)).toEqual(["tdd"]);
        });
      },
    );

    Scenario(
      "A skill I edited in place tells me what I am about to lose",
      ({ Given, But, When, Then, And }) => {
        Given('a registered repo with only "tdd" deployed', async () => {
          await deploySkills(["tdd"]);
          await register();
        });
        But('my deployed copy of "tdd" has local edits', () => {
          deployedState = "diverged";
        });
        When('I ask what removing "tdd" would cost', () =>
          preflightSkill("tdd"),
        );
        Then("I am told those local edits would be lost", async () => {
          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({
            warning: "local-edits-will-be-lost",
          });
        });
        And("nothing has been removed yet", async () => {
          expect(removeCalls).toEqual([]);
          expect((await readDeployState()).map((p) => p.name)).toEqual(["tdd"]);
        });
      },
    );

    Scenario(
      "Having been warned, I remove the edited skill anyway",
      ({ Given, But, When, Then, And }) => {
        Given('a registered repo with only "tdd" deployed', async () => {
          await deploySkills(["tdd"]);
          await register();
        });
        But('my deployed copy of "tdd" has local edits', () => {
          deployedState = "diverged";
        });
        When('I remove "tdd" from that repo', () => removeSkill("tdd"));
        Then("the removal is confirmed", () => {
          expect(response.status).toBe(200);
        });
        And("that repo's deploy-state is empty, not an error", async () => {
          expect(await readDeployState()).toEqual([]);
        });
      },
    );

    Scenario(
      "A copy with nothing to check it against says so in its own words",
      ({ Given, But, When, Then }) => {
        Given('a registered repo with only "tdd" deployed', async () => {
          await deploySkills(["tdd"]);
          await register();
        });
        But(
          'my deployed copy of "tdd" has no baseline to check against',
          () => {
            deployedState = "unverifiable";
          },
        );
        When('I ask what removing "tdd" would cost', () =>
          preflightSkill("tdd"),
        );
        Then("I am told the copy cannot be checked", async () => {
          // Its own wording: calling an unverifiable copy "edited" would claim
          // something no check ever saw.
          expect(await response.json()).toEqual({
            warning: "cannot-verify-local-edits",
          });
        });
      },
    );

    Scenario(
      "A skill that is not there is not reported as removed",
      ({ Given, When, Then }) => {
        Given('a registered repo with only "jobs" deployed', async () => {
          await deploySkills(["jobs"]);
          await register();
        });
        When('I remove "tdd" from that repo', () => removeSkill("tdd"));
        Then("I am told there was nothing to remove", async () => {
          expect(response.status).toBe(404);
          expect(removeCalls).toEqual([]);
        });
      },
    );
  },
);
