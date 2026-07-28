import {
  access,
  mkdir,
  mkdtemp,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import {
  ConfigStore,
  DeployedCleanupAdapter,
  type DeployedContentState,
  DeployedLocation,
  DeployedRefAdapter,
  GlobalDeployStateReader,
  InventoryReader,
  NodeFileSystem,
  Registry,
  RemoveDeployedSkill,
  type SupportedTool,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { expect } from "vitest";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDrift } from "../helpers/stub-drift";

const feature = await loadFeature(
  "tests/acceptance/remove-deployed-skill.feature",
);

// Acceptance lane: drives the real server API against a temp repo and a sandbox
// apm user-scope root (never the real ~/.apm), with the Origin/Host guard
// disabled. Only apm is faked — and it is faked faithfully: a confirmed removal
// rewrites the target's lockfile exactly as apm does, including deleting the
// file rather than emptying it when the last dependency goes
// (docs/apm-behavior.md § Remove). Deploy-state is then read back through the
// same route a user's screen reads, so "the row disappears" is asserted end to
// end rather than assumed.

type DeployedPrimitive = { type: string; name: string; version: string };

// The tool copies a global entry carries. The global deploy-state read groups
// per tool from these, so a skill only appears on a card whose tool has a file.
const globalDeployedFiles = (name: string, tools: SupportedTool[]) =>
  tools.map((tool) =>
    tool === "claude"
      ? `.claude/skills/${name}/SKILL.md`
      : `.agents/skills/${name}/SKILL.md`,
  );

const lockfileFor = (
  names: string[],
  deployedFiles?: (name: string) => string[],
) =>
  [
    "lockfile_version: '1'",
    "dependencies:",
    ...names.flatMap((name) => [
      "- repo_url: fimoklei/agent-harness",
      "  host: github.com",
      "  resolved_ref: v0.5.1",
      `  virtual_path: skills/${name}`,
      "  package_type: claude_skill",
      ...(deployedFiles
        ? [
            "  deployed_files:",
            ...deployedFiles(name).map((file) => `  - ${file}`),
          ]
        : []),
    ]),
    "",
  ].join("\n");

describeFeature(
  feature,
  ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
    let workspace: string;
    let repo: string;
    // The sandbox that stands in for the user's home: apm's user-scope lockfile
    // lives under it, so no scenario can read or write the real ~/.apm
    // (.claude/rules/apm-driver.md § Danger).
    let home: string;
    let app: ReturnType<typeof buildApp>;
    let response: Response;
    let removeCalls: string[];
    let apmConfirms: boolean;
    // Which tools this machine has. A global removal covers exactly these, and
    // an empty set leaves no scope to remove from (ADR-0011).
    let detectedTools: SupportedTool[];
    // What apm believes is installed in the user scope, kept beside the global
    // lockfile the fake rewrites.
    let globalDeployed: string[];
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
          // HOME redirected at the sandbox, so the global lockfile this resolves
          // is the scenario's own.
          location: new DeployedLocation({ HOME: home }),
        }),
        deployedContent: { classify: async () => deployedState },
        apm: {
          removeSkill: async ({ target, ref }) => {
            removeCalls.push(ref);
            if (!apmConfirms) {
              return { ok: false };
            }
            const drop = (names: string[]) =>
              names.filter((name) => !ref.includes(`/skills/${name}#`));
            if (target.kind === "repo") {
              deployed = drop(deployed);
              await writeLockfile();
            } else {
              globalDeployed = drop(globalDeployed);
              await writeGlobalLockfile();
            }
            return { ok: true };
          },
        },
        // The real reclaim, pointed at the sandbox home: a global removal also
        // clears the copies apm could not reach, and it must do that on a real
        // tree rather than a fake (#339).
        deployedCleanup: new DeployedCleanupAdapter({
          location: new DeployedLocation({ HOME: home }),
        }),
        toolPresence: { detectGlobalTools: async () => detectedTools },
        canonicalPath: (path) => fs.realpath(path),
        // Same sandbox HOME the cleanup resolves against, so a reclaim
        // preview names exactly the path the cleanup would delete.
        location: new DeployedLocation({ HOME: home }),
      });
      return createApp({
        registry,
        inventory,
        // The real reader on both routes: the global scenarios read their own
        // sandbox lockfile back, so a removal is proven against what a user's
        // screen would show.
        deployState: new GlobalDeployStateReader({
          fs,
          toolPresence: { detectGlobalTools: async () => detectedTools },
        }),
        deploy: stubDeploy({ inventory, registry }),
        remove,
        drift: stubDrift({ registry }),
        resolveGlobalRoot: () => join(home, ".apm"),
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

    // The same rule in the user scope, one directory deeper: apm keeps its
    // global bookkeeping under ~/.apm while the copies themselves land under
    // HOME (apm-driver.md).
    async function writeGlobalLockfile() {
      const apmRoot = join(home, ".apm");
      const path = join(apmRoot, "apm.lock.yaml");
      if (globalDeployed.length === 0) {
        await unlink(path).catch(() => undefined);
        return;
      }
      await mkdir(apmRoot, { recursive: true });
      await writeFile(
        path,
        lockfileFor(globalDeployed, (name) =>
          globalDeployedFiles(name, detectedTools),
        ),
        "utf8",
      );
    }

    BeforeEachScenario(async () => {
      workspace = await mkdtemp(join(tmpdir(), "maestro-remove-"));
      repo = await mkdtemp(join(tmpdir(), "maestro-remove-repo-"));
      home = await mkdtemp(join(tmpdir(), "maestro-remove-home-"));
      removeCalls = [];
      apmConfirms = true;
      deployedState = "clean";
      deployed = [];
      globalDeployed = [];
      detectedTools = ["claude", "codex"];
      app = buildApp(join(workspace, "config.json"));
    });

    AfterEachScenario(async () => {
      for (const dir of [workspace, repo, home]) {
        await rm(dir, { recursive: true, force: true });
      }
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

    async function deploySkillsGlobally(names: string[]) {
      globalDeployed = names;
      await writeGlobalLockfile();
    }

    // The wire shape of a remove target, as the cockpit sends it. The global
    // kind carries no path at all: that location is apm's own, resolved
    // server-side (J07).
    type RemoveTarget = { kind: "repo"; repoPath: string } | { kind: "global" };

    const repoTarget = (): RemoveTarget => ({ kind: "repo", repoPath: repo });
    const globalTarget = (): RemoveTarget => ({ kind: "global" });

    async function removeSkill(
      name: string,
      target = repoTarget(),
      confirmedReclaimToken?: string,
    ) {
      response = await app.request("/api/deploy/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "skill",
          name,
          target,
          ...(confirmedReclaimToken ? { confirmedReclaimToken } : {}),
        }),
      });
    }

    // What the confirmation is shown before it commits, and the token that
    // proves it: a global removal would otherwise reclaim a leftover copy
    // silently. A scenario that means to exercise the reclaim echoes
    // back exactly the token this same preflight call issued — never a
    // hand-built path, which the server no longer accepts as consent.
    async function reclaimTokenFor(
      name: string,
      target: RemoveTarget,
    ): Promise<string | undefined> {
      const preflightResponse = await app.request(
        "/api/deploy/remove/preflight",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "skill", name, target }),
        },
      );
      const { reclaim } = (await preflightResponse.json()) as {
        reclaim: { token: string } | null;
      };
      return reclaim?.token;
    }

    // The question the confirmation asks before the user commits: what would
    // this removal destroy?
    async function preflightSkill(name: string, target = repoTarget()) {
      response = await app.request("/api/deploy/remove/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "skill", name, target }),
      });
    }

    // The global deploy-state as a user's screen reads it: one group per
    // detected tool, so a removal can be proven per tool rather than in
    // aggregate.
    async function readGlobalDeployState(): Promise<
      { tool: string; primitives: DeployedPrimitive[] }[]
    > {
      const state = await app.request("/api/deploy-state/global");
      expect(state.status).toBe(200);
      const { tools } = (await state.json()) as {
        tools: { tool: string; primitives: DeployedPrimitive[] }[];
      };
      return tools;
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
            reclaim: null,
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
            reclaim: null,
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

    // The user scope. One action covers every detected tool: apm's uninstall has
    // no -t, and the one lever that looks like per-tool scoping orphans the
    // other tools' files (apm-behavior.md § Remove, ADR-0013).
    const givenDeployedGlobally = () => deploySkillsGlobally(["tdd", "jobs"]);

    // The copies themselves, on disk under the sandbox home, for the scenarios
    // that are about what survives a removal rather than what a lockfile says.
    async function writeGlobalCopies(names: string[]) {
      for (const name of names) {
        for (const file of globalDeployedFiles(name, ["claude", "codex"])) {
          const absolute = join(home, file);
          await mkdir(dirname(absolute), { recursive: true });
          await writeFile(absolute, `# ${name}\n`, "utf8");
        }
      }
    }

    const existsUnderHome = async (relativePath: string) => {
      try {
        await access(join(home, relativePath));
        return true;
      } catch {
        return false;
      }
    };

    Scenario(
      "I take a globally deployed skill off every tool in one action",
      ({ Given, When, Then, And }) => {
        Given(
          '"tdd" and "jobs" deployed globally on Claude Code and Codex',
          givenDeployedGlobally,
        );
        When('I remove "tdd" globally', () =>
          removeSkill("tdd", globalTarget()),
        );
        Then("the removal is confirmed", async () => {
          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({
            removed: { type: "skill", name: "tdd" },
          });
        });
        And('no tool\'s global deploy-state lists "tdd" any more', async () => {
          const tools = await readGlobalDeployState();
          expect(tools.map((group) => group.tool)).toEqual(["claude", "codex"]);
          for (const group of tools) {
            expect(group.primitives.map((p) => p.name)).not.toContain("tdd");
          }
        });
        And('every tool still lists "jobs"', async () => {
          for (const group of await readGlobalDeployState()) {
            expect(group.primitives.map((p) => p.name)).toEqual(["jobs"]);
          }
        });
      },
    );

    Scenario(
      "The copy left by a tool I no longer have goes too",
      ({ Given, But, When, Then, And }) => {
        Given(
          '"tdd" and "jobs" deployed globally on Claude Code and Codex',
          async () => {
            await givenDeployedGlobally();
            await writeGlobalCopies(["tdd", "jobs"]);
          },
        );
        But("Claude Code is no longer on this machine", () => {
          detectedTools = ["codex"];
        });
        When('I remove "tdd" globally', async () => {
          // The cockpit's confirmation names the leftover before the user
          // agrees to it — this scenario is the user having seen and
          // confirmed it, echoing back the token that preflight issued.
          const confirmedReclaimToken = await reclaimTokenFor(
            "tdd",
            globalTarget(),
          );
          await removeSkill("tdd", globalTarget(), confirmedReclaimToken);
        });
        Then("the removal is confirmed", () => {
          expect(response.status).toBe(200);
        });
        And('no copy of "tdd" is left behind for Claude Code', async () => {
          expect(await existsUnderHome(".claude/skills/tdd")).toBe(false);
        });
        And('the copy of "jobs" is untouched', async () => {
          expect(await existsUnderHome(".claude/skills/jobs/SKILL.md")).toBe(
            true,
          );
        });
      },
    );

    Scenario(
      "A leftover copy I never confirmed is left alone",
      ({ Given, But, When, Then, And }) => {
        Given(
          '"tdd" and "jobs" deployed globally on Claude Code and Codex',
          async () => {
            await givenDeployedGlobally();
            await writeGlobalCopies(["tdd", "jobs"]);
          },
        );
        But("Claude Code is no longer on this machine", () => {
          detectedTools = ["codex"];
        });
        When(
          'I remove "tdd" globally without confirming the leftover copy',
          () => removeSkill("tdd", globalTarget()),
        );
        Then("the removal is confirmed", () => {
          expect(response.status).toBe(200);
        });
        And("the leftover copy for Claude Code is still there", async () => {
          expect(await existsUnderHome(".claude/skills/tdd/SKILL.md")).toBe(
            true,
          );
        });
        And('the copy of "jobs" is untouched', async () => {
          expect(await existsUnderHome(".claude/skills/jobs/SKILL.md")).toBe(
            true,
          );
        });
      },
    );

    Scenario(
      "A guessed confirmation for the leftover copy is never honored",
      ({ Given, But, When, Then, And }) => {
        Given(
          '"tdd" and "jobs" deployed globally on Claude Code and Codex',
          async () => {
            await givenDeployedGlobally();
            await writeGlobalCopies(["tdd", "jobs"]);
          },
        );
        But("Claude Code is no longer on this machine", () => {
          detectedTools = ["codex"];
        });
        When(
          'I remove "tdd" globally with a made-up confirmation',
          // A direct request that never called preflight, echoing back a
          // plausible-looking but unissued token — the bypass a client-supplied
          // path list would have left open (#390).
          () => removeSkill("tdd", globalTarget(), "a".repeat(64)),
        );
        Then("the removal is confirmed", () => {
          expect(response.status).toBe(200);
        });
        And("the leftover copy for Claude Code is still there", async () => {
          expect(await existsUnderHome(".claude/skills/tdd/SKILL.md")).toBe(
            true,
          );
        });
        And('the copy of "jobs" is untouched', async () => {
          expect(await existsUnderHome(".claude/skills/jobs/SKILL.md")).toBe(
            true,
          );
        });
      },
    );

    Scenario(
      "A machine with no supported tool has no global scope to remove from",
      ({ Given, But, When, Then }) => {
        Given(
          '"tdd" and "jobs" deployed globally on Claude Code and Codex',
          givenDeployedGlobally,
        );
        But("this machine has no supported tool", () => {
          detectedTools = [];
        });
        When('I remove "tdd" globally', () =>
          removeSkill("tdd", globalTarget()),
        );
        Then("I am refused and apm is never asked to remove anything", () => {
          expect(response.status).toBe(409);
          expect(removeCalls).toEqual([]);
        });
      },
    );

    Scenario(
      "The global confirmation says what a removal would cost",
      ({ Given, But, When, Then, And }) => {
        Given(
          '"tdd" and "jobs" deployed globally on Claude Code and Codex',
          givenDeployedGlobally,
        );
        But('my deployed copy of "tdd" has local edits', () => {
          deployedState = "diverged";
        });
        When('I ask what removing "tdd" globally would cost', () =>
          preflightSkill("tdd", globalTarget()),
        );
        Then("I am told those local edits would be lost", async () => {
          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({
            warning: "local-edits-will-be-lost",
            reclaim: null,
          });
        });
        And("nothing has been removed yet", async () => {
          expect(removeCalls).toEqual([]);
          for (const group of await readGlobalDeployState()) {
            expect(group.primitives.map((p) => p.name)).toContain("tdd");
          }
        });
      },
    );
  },
);
