import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import {
  CheckVersionDrift,
  ConfigStore,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { expect } from "vitest";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubRemove } from "../helpers/stub-remove";

const feature = await loadFeature("tests/acceptance/j04-see-drift.feature");

// Acceptance lane for J04: drives the real server API against a temp repo, with
// the judgment delegated to an injected fake apm driver — the same seam the
// real ApmCliDriver fills. The fake's outcome is set per scenario, so a behind
// skill, a current skill, and a check that could not run each read like the job
// map rather than like server internals.
type VersionDrift = { name: string; current: string; latest: string };
type OutdatedOutcome =
  | { ok: true; behind: VersionDrift[] }
  | { ok: false; reason?: "unverified" };

const tddBehind: VersionDrift = {
  name: "tdd",
  current: "v0.5.0",
  latest: "v0.5.1",
};

function buildApp(configPath: string, getOutcome: () => OutdatedOutcome) {
  const fs = new NodeFileSystem();
  const registry = new Registry({
    fs,
    store: new ConfigStore({ fs, configPath }),
  });
  const inventory = new InventoryReader({ fs, resolvePath: () => undefined });
  const drift = new CheckVersionDrift({
    registry,
    apm: { checkOutdated: async () => getOutcome() },
    canonicalPath: (path) => fs.realpath(path),
  });
  return createApp({
    registry,
    inventory,
    deployState: stubDeployState({ fs }),
    deploy: stubDeploy({ inventory, registry }),
    remove: stubRemove({ registry }),
    drift,
    resolveGlobalRoot: () => "/nonexistent-apm-root",
    connect: stubConnect(),
    browse: stubBrowse(),
    enforceOriginHost: false,
  });
}

describeFeature(
  feature,
  ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
    let workspace: string;
    let repo: string;
    let outcome: OutdatedOutcome;
    let app: ReturnType<typeof buildApp>;
    let response: Response;

    BeforeEachScenario(async () => {
      workspace = await mkdtemp(join(tmpdir(), "maestro-j04-"));
      repo = await mkdtemp(join(tmpdir(), "maestro-j04-repo-"));
      outcome = { ok: true, behind: [] };
      app = buildApp(join(workspace, "config.json"), () => outcome);
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

    async function checkDrift() {
      response = await app.request(
        `/api/drift?repo=${encodeURIComponent(repo)}`,
      );
    }

    async function checkGlobalDrift(query = "") {
      response = await app.request(`/api/drift/global${query}`);
    }

    Scenario(
      "A skill behind the latest tag is seen with its deployed -> latest pair",
      ({ Given, When, Then }) => {
        Given(
          'a registered repo where apm reports "tdd" behind from v0.5.0 to v0.5.1',
          async () => {
            outcome = { ok: true, behind: [tddBehind] };
            await register(repo);
          },
        );
        When("I check that repo's drift", checkDrift);
        Then('I see "tdd" reported behind from v0.5.0 to v0.5.1', async () => {
          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({ behind: [tddBehind] });
        });
      },
    );

    Scenario(
      "A current skill is seen as up-to-date",
      ({ Given, When, Then }) => {
        Given(
          "a registered repo where apm reports nothing behind",
          async () => {
            outcome = { ok: true, behind: [] };
            await register(repo);
          },
        );
        When("I check that repo's drift", checkDrift);
        Then("I see nothing reported as behind", async () => {
          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({ behind: [] });
        });
      },
    );

    Scenario(
      "A check that could not run is seen as unknown, never up-to-date",
      ({ Given, When, Then }) => {
        Given("a registered repo where the apm check cannot run", async () => {
          outcome = { ok: false };
          await register(repo);
        });
        When("I check that repo's drift", checkDrift);
        Then(
          "I see the check reported as failed, not an empty up-to-date result",
          async () => {
            expect(response.status).toBe(200);
            const body = await response.json();
            // The distinct "unknown" shape — never { behind: [] }, which would
            // falsely read as up-to-date.
            expect(body).toEqual({ ok: false });
          },
        );
      },
    );

    Scenario(
      "A skill apm could not reach the source for is seen as unverified",
      ({ Given, When, Then }) => {
        Given(
          "a registered repo where apm could not reach the source to check the skill",
          async () => {
            outcome = { ok: false, reason: "unverified" };
            await register(repo);
          },
        );
        When("I check that repo's drift", checkDrift);
        Then(
          "I see the check reported as unverified, not an empty up-to-date result",
          async () => {
            expect(response.status).toBe(200);
            // Distinct from both { behind: [] } (a false up-to-date) and a bare
            // { ok: false }: the reason points the cockpit at auth/network.
            expect(await response.json()).toEqual({
              ok: false,
              reason: "unverified",
            });
          },
        );
      },
    );

    Scenario(
      "A globally deployed skill behind the latest tag is seen with its pair",
      ({ Given, When, Then }) => {
        Given('global apm reports "tdd" behind from v0.5.0 to v0.5.1', () => {
          outcome = { ok: true, behind: [tddBehind] };
        });
        When(
          "I check global drift with a bogus repo path in the query",
          async () => {
            await checkGlobalDrift("?repo=/tmp/not-used");
          },
        );
        Then(
          'I see "tdd" reported as globally behind from v0.5.0 to v0.5.1',
          async () => {
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ behind: [tddBehind] });
          },
        );
      },
    );

    Scenario(
      "A global check that could not run is seen as unknown, never up-to-date",
      ({ Given, When, Then }) => {
        Given("global apm cannot check drift", () => {
          outcome = { ok: false };
        });
        When("I check global drift", () => checkGlobalDrift());
        Then(
          "I see the global check reported as failed, not an empty up-to-date result",
          async () => {
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ ok: false });
          },
        );
      },
    );
  },
);
