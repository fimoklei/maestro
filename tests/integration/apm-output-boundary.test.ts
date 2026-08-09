// The wire-level fence for ADR-0018: nothing from apm's stdout or stderr may
// reach the client. Driven end to end on purpose — the driver's own unit tests
// prove its return value is clean, but only a run through the use-case, the
// error table and the Hono route proves nothing re-attaches the output further
// down. The real ApmCliDriver is used, with its injected `run` standing in for
// apm itself; everything else on the path is real.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ApmCliDriver,
  CheckVersionDrift,
  DeployedCleanupAdapter,
  DeployedContentAdapter,
  DeployedLocation,
  DeployedRefAdapter,
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
  RemoveDeployedSkill,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubHarness } from "../helpers/stub-harness";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubScaffold } from "../helpers/stub-scaffold";

// The curated sentence the failure is allowed to say, from the server's
// `removeErrorResponses` table. Spelled out here so a change to the wording has
// to be a deliberate edit in two places, not a silent widening.
const CURATED_SENTENCE =
  "apm did not confirm the removal. Check apm and try again.";

// Each shape apm's real output can carry, named so a leak reports which kind of
// secret escaped rather than "a string was found". Synthetic by design: these
// must never be real captures, and the test asserts absence, so nothing here
// depends on apm's phrasing.
const LEAK_SHAPES = {
  "a GitHub token": "ghp_0000000000000000000000000000000000oops",
  "a credential embedded in a fetch URL":
    "https://x-access-token:ghp_0000000000000000000000000000000000oops@github.com/fimoklei/agent-harness.git",
  "an absolute path outside the target":
    "/Users/someone/.codex/skills/secret-scan/SKILL.md",
  "apm's raw stderr sentence":
    "PermissionError: [Errno 13] Permission denied: '/Users/someone/.codex/skills/secret-scan/'",
  "an environment variable apm echoed back":
    "GITHUB_APM_PAT=github_pat_0000000000_oops",
};

// A failing uninstall: apm exits 0 with no positive marker, which is the only
// signal the driver reads (apm-behavior.md § Remove). Every leak shape rides
// along on stdout and stderr, the way a real credential-bearing run would.
const poisonedApmOutput = {
  stdout: ["[*] Uninstalling 1 package...", ...Object.values(LEAK_SHAPES)].join(
    "\n",
  ),
  stderr: Object.values(LEAK_SHAPES).join("\n"),
};

// An `apm outdated` row carrying a leak shape in one cell. Drift is the one place
// apm-derived data is allowed through, so the fence has to run against the shape
// of a real table, not against prose. Column order and the light bar are the
// parser's contract (apm-behavior.md § Drift).
const poisonedDriftTable = (cell: "package" | "current" | "latest") => {
  const cells = {
    package: "owner/repo/skills/tdd",
    current: "v0.5.0",
    latest: "v0.5.1",
  };
  cells[cell] = LEAK_SHAPES["a credential embedded in a fetch URL"];
  return {
    stdout: [
      `│ ${cells.package} │ ${cells.current} │ ${cells.latest} │ outdated │ git tags │`,
      "[!] 1 outdated dependency found",
    ].join("\n"),
    stderr: "",
  };
};

describe("apm output never reaches the client", () => {
  let home: string;
  let repo: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-apm-boundary-home-"));
    repo = await mkdtemp(join(tmpdir(), "maestro-apm-boundary-repo-"));
  });

  afterEach(async () => {
    for (const dir of [home, repo]) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // `rejects` covers the other half of the driver's read: a non-zero exit
  // arrives as a rejection whose error object carries the same two streams.
  async function removeFailingWith(mode: "resolves" | "rejects") {
    const fs = new NodeFileSystem();
    const location = new DeployedLocation({ HOME: home });
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({ fs, resolvePath: () => undefined });
    const apm = new ApmCliDriver({
      run: async () => {
        if (mode === "rejects") {
          throw Object.assign(new Error("Command failed: apm uninstall"), {
            ...poisonedApmOutput,
            code: 1,
          });
        }
        return poisonedApmOutput;
      },
    });
    const locks = new InFlightLocks();
    const app = createApp({
      registry,
      inventory,
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: new RemoveDeployedSkill({
        registry,
        deployedRef: new DeployedRefAdapter({ fs, location }),
        deployedContent: new DeployedContentAdapter({ location }),
        apm,
        deployedCleanup: new DeployedCleanupAdapter({ location }),
        toolPresence: { detectGlobalTools: async () => ["claude"] },
        canonicalPath: (path) => fs.realpath(path),
        locks,
        location,
      }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => join(home, "apm"),
      harness: stubHarness(),
      publish: stubPublish(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      browse: stubBrowse(),
      enforceOriginHost: false,
    });

    await writeFile(
      join(repo, "apm.lock.yaml"),
      [
        "lockfile_version: '1'",
        "dependencies:",
        "- repo_url: fimoklei/agent-harness",
        "  host: github.com",
        "  resolved_ref: v0.5.1",
        "  virtual_path: .apm/skills/tdd",
        "  package_type: claude_skill",
        "",
      ].join("\n"),
      "utf8",
    );
    await registry.register(repo);

    const request = {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: repo },
    };
    // Priced first, so the removal reaches apm rather than stopping at the
    // unacknowledged-cost refusal (#364).
    const preflight = await app.request("/api/deploy/remove/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const { receipt } = (await preflight.json()) as { receipt?: string };
    const response = await app.request("/api/deploy/remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...request, confirmedRemovalReceipt: receipt }),
    });
    return { status: response.status, body: await response.text() };
  }

  it("answers a failed removal with the curated sentence and nothing else", async () => {
    const { status, body } = await removeFailingWith("resolves");

    expect(status).toBe(502);
    expect(JSON.parse(body)).toEqual({
      error: "remove-failed",
      message: CURATED_SENTENCE,
      // The per-target probe reads the disk, never apm's output (#416).
      outcome: { scope: "repo", state: "removed" },
    });
  });

  for (const [shape, fragment] of Object.entries(LEAK_SHAPES)) {
    it(`strips ${shape} from the failed removal's response`, async () => {
      const { body } = await removeFailingWith("resolves");

      expect(body).not.toContain(fragment);
    });

    it(`strips ${shape} when apm exits non-zero`, async () => {
      const { body } = await removeFailingWith("rejects");

      expect(body).not.toContain(fragment);
    });
  }

  it("states no exit code, so the label cannot claim apm's terms", async () => {
    // apm exits 0 on every uninstall outcome, so `apm exited 1` would be
    // invented on this route — the reason ADR-0018 keeps the label fixed.
    const { body } = await removeFailingWith("rejects");

    expect(body).not.toMatch(/exit/i);
  });

  // Drift is the one channel apm-derived data is allowed through: `apm outdated`
  // has no --json, so the version pair can only come off its table (ADR-0007).
  // That makes these two routes the boundary's real test — the shape check in
  // `parseOutdated` is what keeps them honest, not the absence of a channel.
  describe("the drift routes, where apm-derived fields are allowed through", () => {
    async function driftWith(poisoned: { stdout: string; stderr: string }) {
      const fs = new NodeFileSystem();
      const registry = realRegistry(fs, join(home, "config.json"));
      const inventory = new InventoryReader({
        fs,
        resolvePath: () => undefined,
      });
      const locks = new InFlightLocks();
      const app = createApp({
        registry,
        inventory,
        deployState: stubDeployState({ fs }),
        deploy: stubDeploy({ inventory, registry, locks }),
        remove: stubRemove({ registry, locks }),
        drift: new CheckVersionDrift({
          registry,
          apm: new ApmCliDriver({
            run: async () => poisoned,
            prepareGlobalCwd: async () => home,
          }),
          canonicalPath: (path) => fs.realpath(path),
        }),
        resolveGlobalRoot: () => join(home, "apm"),
        harness: stubHarness(),
        publish: stubPublish(),
        connect: stubConnect(),
        scaffold: stubScaffold(),
        browse: stubBrowse(),
        enforceOriginHost: false,
      });
      await registry.register(repo);

      const perRepo = await app.request(
        `/api/drift?repo=${encodeURIComponent(repo)}`,
      );
      const global = await app.request("/api/drift/global");
      return {
        perRepo: await perRepo.text(),
        global: await global.text(),
      };
    }

    for (const cell of ["package", "current", "latest"] as const) {
      it(`refuses the whole read when the ${cell} cell carries a credential`, async () => {
        const { perRepo, global } = await driftWith(poisonedDriftTable(cell));

        const fragment = LEAK_SHAPES["a credential embedded in a fetch URL"];
        expect(perRepo).not.toContain(fragment);
        expect(global).not.toContain(fragment);
        // Refused, not silently emptied: an empty behind set renders as
        // up-to-date, which would hide both the leak and the drift (J04).
        expect(JSON.parse(perRepo)).toEqual({ ok: false });
        expect(JSON.parse(global)).toEqual({ ok: false });
      });
    }

    it("still forwards a row whose three fields hold their shape", async () => {
      // The fence must not be a blanket refusal — drift is a shipped feature.
      const { perRepo } = await driftWith({
        stdout: [
          "│ owner/repo/skills/tdd │ v0.5.0 │ v0.5.1 │ outdated │ git tags │",
          "[!] 1 outdated dependency found",
        ].join("\n"),
        stderr: "",
      });

      expect(JSON.parse(perRepo)).toEqual({
        behind: [{ name: "tdd", current: "v0.5.0", latest: "v0.5.1" }],
      });
    });
  });
});
