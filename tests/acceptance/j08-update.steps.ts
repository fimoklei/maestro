import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import {
  CheckVersionDrift,
  ConfigStore,
  DeploySkill,
  DeployStateReader,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { expect } from "vitest";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";

const feature = await loadFeature("tests/acceptance/j08-update.feature");

// Acceptance lane for J08: drives the real server API to update a behind skill,
// then reads the result back through the real deploy-state and drift endpoints.
// apm is faked (network/auth stays out of the fast loop) but is *stateful* — it
// holds the deployed ref, so update flips the real transition: behind at v0.5.0
// → re-deploy at the latest tag → current at v0.5.1, with drift agreeing. The
// post-update lockfile is the captured v0.5.1 fixture, written where the
// deploy-state endpoint reads it. The Origin/Host guard is disabled, as in the
// other acceptance journeys.
const LATEST_TAG = "v0.5.1";
// Captured tag-pinned lockfiles: the deployed state before and after the
// update. deploy-state reads `resolved_ref` from these as the version.
const LOCKFILE_V050 = "tests/fixtures/apm.lock.tag-pinned.yaml";
const LOCKFILE_V051 = "tests/fixtures/apm.lock.tag-pinned-v0.5.1.yaml";

type DeployedPrimitive = { type: string; name: string; version: string };

describeFeature(
  feature,
  ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
    let workspace: string;
    let repo: string;
    let harness: string;
    // The stateful seam: the ref apm currently has deployed. Drift is behind
    // while it lags the latest tag; an update re-deploys and bumps it.
    let deployedRef: string;
    let app: ReturnType<typeof createApp>;
    let response: Response;

    BeforeEachScenario(async () => {
      workspace = await mkdtemp(join(tmpdir(), "maestro-j08-"));
      repo = await mkdtemp(join(tmpdir(), "maestro-j08-repo-"));
      harness = join(workspace, "harness");
      deployedRef = "v0.5.0";

      const fs = new NodeFileSystem();
      const registry = new Registry({
        fs,
        store: new ConfigStore({
          fs,
          configPath: join(workspace, "config.json"),
        }),
      });
      const inventory = new InventoryReader({ fs, resolvePath: () => harness });
      const deploy = new DeploySkill({
        inventory,
        registry,
        apm: {
          resolveLatestTag: async () => ({ ok: true, tag: LATEST_TAG }),
          // Update = re-install at the latest tag: write the new pinned
          // lockfile where the repo's deploy-state reads it, and advance the
          // deployed ref so the next drift check reads current.
          deploySkill: async ({ target }) => {
            if (target.kind !== "repo") {
              throw new Error("this journey updates a repo target only");
            }
            await writeFile(
              join(target.repoPath, "apm.lock.yaml"),
              await readFile(LOCKFILE_V051, "utf8"),
              "utf8",
            );
            deployedRef = LATEST_TAG;
            return { ok: true as const };
          },
        },
        inventoryGit: {
          skillExistsAtTag: async () => true,
          skillDivergesFromTag: async () => false,
        },
        // The update journey re-installs over an unedited deployed copy, so the
        // destination guard sees it clean and lets the update proceed (#56).
        deployedContent: { classify: async () => "clean" },
        deployedCleanup: { removeSkillTargets: async () => undefined },
        toolPresence: { detectGlobalTools: async () => ["claude", "codex"] },
        inventoryOriginUrl: async () =>
          "git@github.com:fimoklei/agent-harness.git",
        canonicalPath: (path) => fs.realpath(path),
      });
      const drift = new CheckVersionDrift({
        registry,
        apm: {
          checkOutdated: async () => ({
            ok: true,
            behind:
              deployedRef === LATEST_TAG
                ? []
                : [{ name: "tdd", current: deployedRef, latest: LATEST_TAG }],
          }),
        },
        canonicalPath: (path) => fs.realpath(path),
      });
      app = createApp({
        registry,
        inventory,
        deployState: new DeployStateReader({ fs }),
        deploy,
        drift,
        resolveGlobalRoot: () => "/nonexistent-apm-root",
        connect: stubConnect(),
        browse: stubBrowse(),
        enforceOriginHost: false,
      });
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

    async function seedInventory() {
      await mkdir(join(harness, "skills", "tdd"), { recursive: true });
      await writeFile(
        join(harness, "skills", "tdd", "SKILL.md"),
        "---\nname: tdd\ndescription: Test-driven development\n---\n",
        "utf8",
      );
    }

    async function repoPrimitives() {
      const res = await app.request(
        `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
      );
      const { primitives } = (await res.json()) as {
        primitives: DeployedPrimitive[];
      };
      return primitives;
    }

    async function repoDrift() {
      const res = await app.request(
        `/api/drift?repo=${encodeURIComponent(repo)}`,
      );
      return res.json();
    }

    Scenario(
      "I update a behind skill and it is no longer behind",
      ({ Given, And, When, Then }) => {
        Given('a registered repo with "tdd" deployed at v0.5.0', async () => {
          await seedInventory();
          await writeFile(
            join(repo, "apm.lock.yaml"),
            await readFile(LOCKFILE_V050, "utf8"),
            "utf8",
          );
          await register(repo);
          expect(await repoPrimitives()).toEqual([
            { type: "skill", name: "tdd", version: "v0.5.0" },
          ]);
        });
        And('apm reports "tdd" is behind the latest tag v0.5.1', async () => {
          expect(await repoDrift()).toEqual({
            behind: [{ name: "tdd", current: "v0.5.0", latest: LATEST_TAG }],
          });
        });
        When('I update "tdd" in that repo', async () => {
          response = await app.request("/api/deploy", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              type: "skill",
              name: "tdd",
              target: { kind: "repo", repoPath: repo },
            }),
          });
        });
        Then("the update succeeds at v0.5.1", async () => {
          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({
            deployed: { type: "skill", name: "tdd", version: LATEST_TAG },
          });
        });
        And('the repo\'s deploy-state reads "tdd" at v0.5.1', async () => {
          expect(await repoPrimitives()).toEqual([
            { type: "skill", name: "tdd", version: LATEST_TAG },
          ]);
        });
        And("the repo's drift reports nothing behind", async () => {
          expect(await repoDrift()).toEqual({ behind: [] });
        });
      },
    );
  },
);
