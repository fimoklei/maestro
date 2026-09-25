// Nothing from apm's stdout or stderr may reach the client. Driven end to end
// through the real driver, use-case, error table and route; only `run` is faked.
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
import { makeRepoDir } from "../helpers/repo-dir";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy, stubRetryOperation } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift, withoutContentCheck } from "../helpers/stub-drift";
import { stubFolderChooser } from "../helpers/stub-folder-chooser";
import { stubHarness } from "../helpers/stub-harness";
import { stubImport } from "../helpers/stub-import";
import { stubPromotes } from "../helpers/stub-promote";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubScaffold } from "../helpers/stub-scaffold";
import { stubUpdate } from "../helpers/stub-update";

// Synthetic on purpose: never real captures. Named so a leak reports which
// kind of secret escaped.
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

// apm exits 0 with no positive marker: the only signal the driver reads.
const poisonedApmOutput = {
  stdout: ["[*] Uninstalling 1 package...", ...Object.values(LEAK_SHAPES)].join(
    "\n",
  ),
  stderr: Object.values(LEAK_SHAPES).join("\n"),
};

// Drift is the one place apm-derived data may pass, so the fence runs against
// a real table shape.
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
    repo = await makeRepoDir("maestro-apm-boundary-repo-");
  });

  afterEach(async () => {
    for (const dir of [home, repo]) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // A non-zero exit arrives as a rejection carrying the same two streams.
  async function removeFailingWith(mode: "resolves" | "rejects") {
    const fs = new NodeFileSystem();
    const location = new DeployedLocation({ HOME: home });
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => undefined,
      readReleasedSkills: async () => [],
    });
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
      importSkill: stubImport(),
      registry,
      inventory,
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry, locks }),
      retryOperation: stubRetryOperation({ registry, locks }),
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
      ...stubPromotes(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      folderChooser: stubFolderChooser(),
      update: stubUpdate(),
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
    // Priced first, so the removal reaches apm (#364).
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

  it("answers a failed removal with its code and nothing else", async () => {
    const { status, body } = await removeFailingWith("resolves");

    expect(status).toBe(502);
    expect(JSON.parse(body)).toEqual({
      error: "remove-failed",
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
    // apm exits 0 on every uninstall outcome, so `apm exited 1` would be invented.
    const { body } = await removeFailingWith("rejects");

    expect(body).not.toMatch(/exit/i);
  });

  // `apm outdated` has no --json, so the version pair comes off its table: the
  // shape check in `parseOutdated` is what keeps these routes honest.
  describe("the drift routes, where apm-derived fields are allowed through", () => {
    async function driftWith(poisoned: { stdout: string; stderr: string }) {
      const fs = new NodeFileSystem();
      const registry = realRegistry(fs, join(home, "config.json"));
      const inventory = new InventoryReader({
        fs,
        resolvePath: () => undefined,
        readReleasedSkills: async () => [],
      });
      const locks = new InFlightLocks();
      const app = createApp({
        importSkill: stubImport(),
        registry,
        inventory,
        deployState: stubDeployState({ fs }),
        deploy: stubDeploy({ inventory, registry, locks }),
        retryOperation: stubRetryOperation({ registry, locks }),
        remove: stubRemove({ registry, locks }),
        drift: withoutContentCheck(
          new CheckVersionDrift({
            registry,
            apm: new ApmCliDriver({
              run: async () => poisoned,
              prepareGlobalCwd: async () => home,
            }),
            canonicalPath: (path) => fs.realpath(path),
          }),
        ),
        resolveGlobalRoot: () => join(home, "apm"),
        harness: stubHarness(),
        publish: stubPublish(),
        ...stubPromotes(),
        connect: stubConnect(),
        scaffold: stubScaffold(),
        folderChooser: stubFolderChooser(),
        update: stubUpdate(),
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
        // Refused, not emptied: an empty behind set would render as up to date.
        expect(JSON.parse(perRepo)).toEqual({ ok: false });
        expect(JSON.parse(global)).toEqual({ ok: false });
      });
    }

    it("still forwards a row whose three fields hold their shape", async () => {
      const { perRepo } = await driftWith({
        stdout: [
          "│ owner/repo/skills/tdd │ v0.5.0 │ v0.5.1 │ outdated │ git tags │",
          "[!] 1 outdated dependency found",
        ].join("\n"),
        stderr: "",
      });

      expect(JSON.parse(perRepo)).toEqual({
        behind: [
          {
            name: "tdd",
            current: "v0.5.0",
            latest: "v0.5.1",
            // No clone to read trees from, so the row falls back to Behind.
            reading: "behind",
          },
        ],
      });
    });
  });
});
