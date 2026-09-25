import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  DeployedCleanupAdapter,
  DeployedContentAdapter,
  type DeployedContentState,
  DeployedLocation,
  DeployedRefAdapter,
  type DeployTarget,
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
  RemoveDeployedSkill,
  type SupportedTool,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { makeRepoDir } from "../helpers/repo-dir";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy, stubRetryOperation } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubFolderChooser } from "../helpers/stub-folder-chooser";
import { stubHarness } from "../helpers/stub-harness";
import { stubImport } from "../helpers/stub-import";
import { stubPromotes } from "../helpers/stub-promote";
import { stubPublish } from "../helpers/stub-publish";
import { stubScaffold } from "../helpers/stub-scaffold";
import { stubUpdate } from "../helpers/stub-update";

// Only the apm driver is faked: the ref it is handed decides whether apm
// removes the right package or silently nothing.
// A fixed file and its recorded sha256, so a lockfile can claim a clean copy.
const SKILL_FILE_CONTENT = "# tdd\n";
const TDD_SKILL_SHA256 =
  "5c35b2b6a904c72893741b59eaf0a591f5b13810d0286949128c2e1888acfba2";

describe("remove HTTP route", () => {
  let home: string;
  let repo: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-remove-home-"));
    repo = await makeRepoDir("maestro-remove-repo-");
  });

  afterEach(async () => {
    for (const dir of [home, repo]) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  const lockfileWith = (entries: string[]) =>
    ["lockfile_version: '1'", "dependencies:", ...entries, ""].join("\n");

  const skillEntry = (name: string, tag = "v0.5.1") =>
    [
      "- repo_url: fimoklei/agent-harness",
      "  host: github.com",
      `  resolved_ref: ${tag}`,
      `  virtual_path: .apm/skills/${name}`,
      "  package_type: claude_skill",
    ].join("\n");

  function makeApp(options?: {
    removed?: boolean;
    // "clean" by default; the guard itself is covered in the core lane.
    deployedState?: DeployedContentState;
    // Only the global route reads it; empty is the no-supported-tool refusal.
    detectedTools?: SupportedTool[];
    // Swaps the stubbed guard for the real one. Off by default.
    realDeployedContent?: boolean;
  }) {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => undefined,
      readReleasedSkills: async () => [],
    });
    const removeCalls: Array<{ target: DeployTarget; ref: string }> = [];
    const classifyCalls: Array<{ tools?: readonly SupportedTool[] }> = [];
    const locks = new InFlightLocks();
    const remove = new RemoveDeployedSkill({
      registry,
      locks,
      deployedRef: new DeployedRefAdapter({
        fs,
        // HOME is the sandbox, so the global lockfile is the test's own,
        // never the real ~/.apm.
        location: new DeployedLocation({ HOME: home }),
      }),
      deployedContent: options?.realDeployedContent
        ? new DeployedContentAdapter({
            location: new DeployedLocation({ HOME: home }),
          })
        : {
            classify: async ({ tools }) => {
              classifyCalls.push({ tools });
              return options?.deployedState ?? "clean";
            },
            contentDigest: async () => null,
          },
      apm: {
        removeSkill: async (input) => {
          removeCalls.push(input);
          return (options?.removed ?? true) ? { ok: true } : { ok: false };
        },
      },
      // The real reclaim on the sandbox home: faking it would prove nothing (#339).
      deployedCleanup: new DeployedCleanupAdapter({
        location: new DeployedLocation({ HOME: home }),
      }),
      toolPresence: {
        detectGlobalTools: async () => options?.detectedTools ?? ["claude"],
      },
      canonicalPath: (path) => fs.realpath(path),
      location: new DeployedLocation({ HOME: home }),
    });
    const app = createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry, locks }),
      retryOperation: stubRetryOperation({ registry, locks }),
      remove,
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
    return { app, registry, removeCalls, classifyCalls };
  }

  const removeRequest = (
    app: ReturnType<typeof makeApp>["app"],
    body: unknown,
  ) =>
    app.request("/api/deploy/remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  // Every removal needs its own preflight's receipt (#364), so a test
  // about anything else sends both halves.
  const removeTdd = async (
    app: ReturnType<typeof makeApp>["app"],
    repoPath: string,
  ) =>
    removeRequest(app, {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath },
      confirmedRemovalReceipt: await receiptFromPreflight(app, repoPath),
    });

  it("removes a deployed skill with the ref its lockfile records", async () => {
    const { app, registry, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      removed: {
        type: "skill",
        name: "tdd",
        version: "v0.5.1",
        scope: { kind: "repo" },
      },
    });
    expect(removeCalls).toEqual([
      {
        target: { kind: "repo", repoPath: repo },
        ref: "github.com/fimoklei/agent-harness/.apm/skills/tdd#v0.5.1",
      },
    ]);
  });

  it("refuses a repo outside the registry before apm or the lockfile is touched", async () => {
    const { app, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(403);
    expect(removeCalls).toEqual([]);
    expect(JSON.stringify(await response.json())).not.toContain("v0.5.1");
  });

  it("refuses a symlinked spelling of an unregistered repo just the same", async () => {
    const { app, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );

    const response = await removeTdd(app, join(repo, "..", "..", "etc"));

    expect(response.status).toBe(403);
    expect(removeCalls).toEqual([]);
  });

  it("reports a skill the repo does not carry as not found", async () => {
    const { app, registry, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("jobs")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(404);
    expect(removeCalls).toEqual([]);
  });

  it("reports a repo with no lockfile at all as nothing deployed", async () => {
    const { app, registry } = makeApp();
    await registry.register(repo);

    expect((await removeTdd(app, repo)).status).toBe(404);
  });

  it("surfaces a malformed lockfile as a conflict, never a removal", async () => {
    const { app, registry, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      "dependencies: not-a-list\n",
      "utf8",
    );
    await registry.register(repo);

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(409);
    expect(removeCalls).toEqual([]);
  });

  it("refuses when the lockfile entry names no origin to build a ref from", async () => {
    const { app, registry, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([
        [
          "- resolved_ref: v0.5.1",
          "  virtual_path: .apm/skills/tdd",
          "  package_type: claude_skill",
        ].join("\n"),
      ]),
      "utf8",
    );
    await registry.register(repo);

    expect((await removeTdd(app, repo)).status).toBe(409);
    expect(removeCalls).toEqual([]);
  });

  // Issued by this app's own preflight route, never hand-built.
  async function receiptFromPreflight(
    app: ReturnType<typeof makeApp>["app"],
    repoPath: string,
  ) {
    const response = await app.request("/api/deploy/remove/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "skill",
        name: "tdd",
        target: { kind: "repo", repoPath },
      }),
    });
    const { receipt } = (await response.json()) as { receipt?: string };
    return receipt;
  }

  it("removes a copy with local edits the user already confirmed", async () => {
    const { app, registry, removeCalls } = makeApp({
      deployedState: "unverifiable",
    });
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeRequest(app, {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: repo },
      confirmedRemovalReceipt: await receiptFromPreflight(app, repo),
    });

    expect(response.status).toBe(200);
    expect(removeCalls).toHaveLength(1);
  });

  it("refuses that same copy when nothing proves the cost was stated", async () => {
    const { app, registry, removeCalls } = makeApp({
      deployedState: "unverifiable",
    });
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeRequest(app, {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: repo },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "cost-not-acknowledged",
      check: { scope: "repo", warning: "cannot-verify-local-edits" },
      receipt: expect.stringMatching(/^[0-9a-f]{64}$/),
      reclaim: null,
    });
    expect(removeCalls).toEqual([]);
  });

  it("keeps an unverifiable copy's own wording in the cost it restates", async () => {
    const { app, registry, removeCalls } = makeApp({
      deployedState: "unverifiable",
    });
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeRequest(app, {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: repo },
    });

    expect(response.status).toBe(409);
    // Never the diverged wording: nothing was found, only no way to look.
    expect((await response.json()) as unknown).toMatchObject({
      check: { scope: "repo", warning: "cannot-verify-local-edits" },
    });
    expect(removeCalls).toEqual([]);
  });

  it("removes that same copy once its own preflight receipt rides along", async () => {
    const { app, registry, removeCalls } = makeApp({
      deployedState: "unverifiable",
    });
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeRequest(app, {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: repo },
      confirmedRemovalReceipt: await receiptFromPreflight(app, repo),
    });

    expect(response.status).toBe(200);
    expect(removeCalls).toHaveLength(1);
  });

  it("refuses a receipt the caller minted for a different skill", async () => {
    const { app, registry, removeCalls } = makeApp({
      deployedState: "unverifiable",
    });
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd"), skillEntry("jobs")]),
      "utf8",
    );
    await registry.register(repo);

    const preflight = await app.request("/api/deploy/remove/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "skill",
        name: "jobs",
        target: { kind: "repo", repoPath: repo },
      }),
    });
    const { receipt } = (await preflight.json()) as { receipt: string };
    const response = await removeRequest(app, {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: repo },
      confirmedRemovalReceipt: receipt,
    });

    expect(response.status).toBe(409);
    expect(removeCalls).toEqual([]);
  });

  it("rejects a receipt that is not even token-shaped, at the edge", async () => {
    const { app, registry, removeCalls } = makeApp({
      deployedState: "unverifiable",
    });
    await registry.register(repo);

    const response = await removeRequest(app, {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: repo },
      confirmedRemovalReceipt: "not-a-receipt",
    });

    expect(response.status).toBe(400);
    expect(removeCalls).toEqual([]);
  });

  // The file priced as clean is edited before the click lands (#364).
  it("refuses and restates the cost when the copy changed after the check", async () => {
    const { app, registry, removeCalls } = makeApp({
      realDeployedContent: true,
    });
    const deployed = join(repo, ".claude", "skills", "tdd", "SKILL.md");
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([
        [
          skillEntry("tdd"),
          "  deployed_file_hashes:",
          `    .claude/skills/tdd/SKILL.md: sha256:${TDD_SKILL_SHA256}`,
        ].join("\n"),
      ]),
      "utf8",
    );
    await mkdir(dirname(deployed), { recursive: true });
    await writeFile(deployed, SKILL_FILE_CONTENT, "utf8");
    await registry.register(repo);
    const stale = await receiptFromPreflight(app, repo);
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );

    const response = await removeRequest(app, {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: repo },
      confirmedRemovalReceipt: stale,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "cost-not-acknowledged",
      check: { scope: "repo", warning: "cannot-verify-local-edits" },
      receipt: expect.stringMatching(/^[0-9a-f]{64}$/),
      reclaim: null,
    });
    expect(removeCalls).toEqual([]);
  });

  // apm 0.29.0 would keep the edited file and abort after deleting the
  // rest, so the copy is refused until it is deployed again (#775).
  it("refuses outright when the copy gained local edits after the check", async () => {
    const { app, registry, removeCalls } = makeApp({
      realDeployedContent: true,
    });
    const deployed = join(repo, ".claude", "skills", "tdd", "SKILL.md");
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([
        [
          skillEntry("tdd"),
          "  deployed_file_hashes:",
          `    .claude/skills/tdd/SKILL.md: sha256:${TDD_SKILL_SHA256}`,
        ].join("\n"),
      ]),
      "utf8",
    );
    await mkdir(dirname(deployed), { recursive: true });
    await writeFile(deployed, SKILL_FILE_CONTENT, "utf8");
    await registry.register(repo);
    const stale = await receiptFromPreflight(app, repo);
    await writeFile(deployed, "# tdd, edited since\n", "utf8");

    const response = await removeRequest(app, {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: repo },
      confirmedRemovalReceipt: stale,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "deployed-diverged-from-lock",
    });
    expect(removeCalls).toEqual([]);
  });

  it("removes the changed copy once the restated cost is confirmed", async () => {
    const { app, registry, removeCalls } = makeApp({
      realDeployedContent: true,
    });
    const deployed = join(repo, ".claude", "skills", "tdd", "SKILL.md");
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([
        [
          skillEntry("tdd"),
          "  deployed_file_hashes:",
          `    .claude/skills/tdd/SKILL.md: sha256:${TDD_SKILL_SHA256}`,
        ].join("\n"),
      ]),
      "utf8",
    );
    await mkdir(dirname(deployed), { recursive: true });
    await writeFile(deployed, SKILL_FILE_CONTENT, "utf8");
    await registry.register(repo);
    const stale = await receiptFromPreflight(app, repo);
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    const refused = (await (
      await removeRequest(app, {
        type: "skill",
        name: "tdd",
        target: { kind: "repo", repoPath: repo },
        confirmedRemovalReceipt: stale,
      })
    ).json()) as { receipt: string };

    const response = await removeRequest(app, {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: repo },
      confirmedRemovalReceipt: refused.receipt,
    });

    expect(response.status).toBe(200);
    expect(removeCalls).toHaveLength(1);
  });

  it("refuses a copy with local edits before apm runs, receipt or not", async () => {
    const { app, registry, removeCalls } = makeApp({
      deployedState: "diverged",
    });
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeRequest(app, {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: repo },
      confirmedRemovalReceipt: "a".repeat(64),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "deployed-diverged-from-lock",
    });
    expect(removeCalls).toEqual([]);
  });

  it("still refuses a copy it cannot read, confirmed or not", async () => {
    const { app, registry, removeCalls } = makeApp({
      deployedState: "unreadable",
    });
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await registry.register(repo);

    expect((await removeTdd(app, repo)).status).toBe(409);
    expect(removeCalls).toEqual([]);
  });

  it("reports an unproven removal as a failure the user can read", async () => {
    const { app, registry } = makeApp({ removed: false });
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("remove-failed");
  });

  // apm reports one outcome for every tool, so a failed removal's
  // per-target answer is read off the disk (#416).
  it("reports the repo's copy as still there when a failed removal left it", async () => {
    const { app, registry } = makeApp({
      removed: false,
      realDeployedContent: true,
    });
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
    await mkdir(join(repo, ".claude", "skills", "tdd"), { recursive: true });
    await writeFile(
      join(repo, ".claude", "skills", "tdd", "SKILL.md"),
      SKILL_FILE_CONTENT,
      "utf8",
    );
    await registry.register(repo);

    const response = await removeRequest(app, {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: repo },
      confirmedRemovalReceipt: await receiptFromPreflight(app, repo),
    });

    expect(response.status).toBe(502);
    expect((await response.json()) as unknown).toMatchObject({
      error: "remove-failed",
      outcome: { scope: "repo", state: "not-removed" },
    });
  });

  it("sends no outcome for a failure that never reached apm", async () => {
    const { app, registry, removeCalls } = makeApp();
    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfileWith([skillEntry("jobs")]),
      "utf8",
    );
    await registry.register(repo);

    const response = await removeTdd(app, repo);

    expect(response.status).toBe(404);
    expect(await response.json()).not.toHaveProperty("outcome");
    expect(removeCalls).toEqual([]);
  });

  it("refuses a primitive type other than a skill", async () => {
    const { app, registry } = makeApp();
    await registry.register(repo);

    const response = await removeRequest(app, {
      type: "hook",
      name: "tdd",
      target: { kind: "repo", repoPath: repo },
    });

    expect(response.status).toBe(422);
  });

  it("refuses a name that is not a lowercase slug", async () => {
    const { app, registry } = makeApp();
    await registry.register(repo);

    const response = await removeRequest(app, {
      type: "skill",
      name: "../etc/passwd",
      target: { kind: "repo", repoPath: repo },
    });

    expect(response.status).toBe(400);
  });

  it("rejects a body that is not the expected shape", async () => {
    const { app } = makeApp();

    expect((await removeRequest(app, { name: "tdd" })).status).toBe(400);
  });

  // The user scope: apm resolves its lockfile, so the request carries no path (#338).
  describe("the global target", () => {
    // Resolved per call: `home` is a fresh sandbox per test.
    async function writeGlobalLockfile(entries: string[]) {
      const apmRoot = join(home, ".apm");
      await mkdir(apmRoot, { recursive: true });
      await writeFile(
        join(apmRoot, "apm.lock.yaml"),
        lockfileWith(entries),
        "utf8",
      );
    }

    async function writeSkillFile(relativePath: string) {
      const absolute = join(home, relativePath);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, SKILL_FILE_CONTENT, "utf8");
    }

    const preflightGlobally = (app: ReturnType<typeof makeApp>["app"]) =>
      app.request("/api/deploy/remove/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "skill",
          name: "tdd",
          target: { kind: "global" },
        }),
      });

    const removeGlobally = async (
      app: ReturnType<typeof makeApp>["app"],
      confirmedReclaimToken?: string,
    ) =>
      removeRequest(app, {
        type: "skill",
        name: "tdd",
        target: { kind: "global" },
        confirmedRemovalReceipt: await receiptFromGlobalPreflight(app),
        ...(confirmedReclaimToken ? { confirmedReclaimToken } : {}),
      });

    async function reclaimTokenFromPreflight(
      app: ReturnType<typeof makeApp>["app"],
    ): Promise<string | undefined> {
      const response = await preflightGlobally(app);
      const { reclaim } = (await response.json()) as {
        reclaim: { token: string } | null;
      };
      return reclaim?.token;
    }

    async function receiptFromGlobalPreflight(
      app: ReturnType<typeof makeApp>["app"],
    ): Promise<string | undefined> {
      const response = await preflightGlobally(app);
      const { receipt } = (await response.json()) as { receipt?: string };
      return receipt;
    }

    it("removes the skill with the ref the global lockfile records", async () => {
      const { app, removeCalls } = makeApp();
      await writeGlobalLockfile([skillEntry("tdd")]);

      const response = await removeGlobally(app);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        removed: {
          type: "skill",
          name: "tdd",
          version: "v0.5.1",
          scope: { kind: "global", tools: ["claude"] },
        },
      });
      expect(removeCalls).toEqual([
        {
          target: { kind: "global" },
          ref: "github.com/fimoklei/agent-harness/.apm/skills/tdd#v0.5.1",
        },
      ]);
    });

    it("takes no path from the client, even one that is offered", async () => {
      const { app, removeCalls } = makeApp();
      await writeGlobalLockfile([skillEntry("tdd")]);

      const response = await removeRequest(app, {
        type: "skill",
        name: "tdd",
        target: { kind: "global", repoPath: "/etc" },
        confirmedRemovalReceipt: await receiptFromGlobalPreflight(app),
      });

      expect(response.status).toBe(200);
      expect(removeCalls).toEqual([
        {
          target: { kind: "global" },
          ref: "github.com/fimoklei/agent-harness/.apm/skills/tdd#v0.5.1",
        },
      ]);
    });

    it("checks every supported tool's copy, not only the detected ones", async () => {
      const { app, classifyCalls } = makeApp({ detectedTools: ["codex"] });
      await writeGlobalLockfile([skillEntry("tdd")]);

      await removeGlobally(app);

      // The removal's own guard, beside the per-tool calls that price it (#414).
      expect(classifyCalls).toContainEqual({ tools: undefined });
    });

    it("answers per detected tool against a real tree", async () => {
      // Claude's copy matches the lockfile; the Codex copy was never recorded (#414).
      const { app } = makeApp({
        realDeployedContent: true,
        detectedTools: ["claude", "codex"],
      });
      await writeGlobalLockfile([
        [
          skillEntry("tdd"),
          "  deployed_file_hashes:",
          `    .claude/skills/tdd/SKILL.md: sha256:${TDD_SKILL_SHA256}`,
        ].join("\n"),
      ]);
      await writeSkillFile(".claude/skills/tdd/SKILL.md");
      await writeSkillFile(".agents/skills/tdd/SKILL.md");

      const response = await preflightGlobally(app);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        check: {
          scope: "global",
          tools: [
            { tool: "claude", warning: null },
            { tool: "codex", warning: "cannot-verify-local-edits" },
          ],
        },
        // Codex shares .agents with other apm targets, so it is never a nameable reclaim.
        reclaim: null,
        receipt: expect.any(String),
      });
    });

    it("names the leftover Claude Code copy and issues a token for it", async () => {
      // Claude Code has dropped off, but its global copy remains: the preview
      // names it, and the token is required back before it is reclaimed.
      const { app } = makeApp({ detectedTools: ["codex"] });
      await writeGlobalLockfile([skillEntry("tdd")]);

      const response = await preflightGlobally(app);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        check: {
          scope: "global",
          tools: [
            { tool: "codex", warning: null },
            { tool: "claude", warning: null },
          ],
        },
        reclaim: {
          previews: [
            { tool: "claude", path: join(home, ".claude/skills/tdd") },
          ],
          token: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
        receipt: expect.any(String),
      });
    });

    it("refuses the check when the leftover copy it would reclaim carries edits", async () => {
      // The dropped tool's copy carries edits, so apm would keep the file and
      // abort: the refusal comes before any consent (#775).
      const { app } = makeApp({
        realDeployedContent: true,
        detectedTools: ["codex"],
      });
      await writeGlobalLockfile([
        [
          skillEntry("tdd"),
          "  deployed_file_hashes:",
          `    .claude/skills/tdd/SKILL.md: sha256:${"0".repeat(64)}`,
        ].join("\n"),
      ]);
      await writeSkillFile(".claude/skills/tdd/SKILL.md");

      const response = await preflightGlobally(app);

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "deployed-diverged-from-lock",
      });
    });

    it("leaves an unrelated skill's copy out of the answer", async () => {
      const { app } = makeApp({
        realDeployedContent: true,
        detectedTools: ["claude"],
      });
      await writeGlobalLockfile([
        [
          skillEntry("tdd"),
          "  deployed_file_hashes:",
          `    .claude/skills/tdd/SKILL.md: sha256:${TDD_SKILL_SHA256}`,
        ].join("\n"),
      ]);
      await writeSkillFile(".claude/skills/tdd/SKILL.md");
      await writeSkillFile(".agents/skills/jobs/SKILL.md");

      const response = await preflightGlobally(app);

      expect(await response.json()).toEqual({
        check: { scope: "global", tools: [{ tool: "claude", warning: null }] },
        reclaim: null,
        receipt: expect.any(String),
      });
    });

    const existsUnderHome = async (relativePath: string) => {
      try {
        await access(join(home, relativePath));
        return true;
      } catch {
        return false;
      }
    };

    it("reclaims the copy left for a tool this machine no longer detects, once confirmed", async () => {
      // apm's uninstall spares a dropped tool's copy; removing it completes
      // the removal (#339), but only with this scope's preflight token (#390).
      const { app } = makeApp({ detectedTools: ["codex"] });
      await writeGlobalLockfile([skillEntry("tdd")]);
      await writeSkillFile(".claude/skills/tdd/SKILL.md");
      await writeSkillFile(".claude/skills/jobs/SKILL.md");
      const confirmedReclaimToken = await reclaimTokenFromPreflight(app);

      expect((await removeGlobally(app, confirmedReclaimToken)).status).toBe(
        200,
      );

      expect(await existsUnderHome(".claude/skills/tdd")).toBe(false);
      // Another skill under the same directory is nobody's leftover.
      expect(await existsUnderHome(".claude/skills/jobs/SKILL.md")).toBe(true);
    });

    it("leaves the leftover copy alone when nothing confirmed it", async () => {
      const { app } = makeApp({ detectedTools: ["codex"] });
      await writeGlobalLockfile([skillEntry("tdd")]);
      await writeSkillFile(".claude/skills/tdd/SKILL.md");

      expect((await removeGlobally(app)).status).toBe(200);

      expect(await existsUnderHome(".claude/skills/tdd/SKILL.md")).toBe(true);
    });

    it("leaves the leftover copy alone for a token the caller merely guessed", async () => {
      const { app } = makeApp({ detectedTools: ["codex"] });
      await writeGlobalLockfile([skillEntry("tdd")]);
      await writeSkillFile(".claude/skills/tdd/SKILL.md");

      expect((await removeGlobally(app, "a".repeat(64))).status).toBe(200);

      expect(await existsUnderHome(".claude/skills/tdd/SKILL.md")).toBe(true);
    });

    it("keeps a skills directory several tools read", async () => {
      // Other apm targets deploy under .agents too, so an absent Codex proves nothing (#202).
      const { app } = makeApp({ detectedTools: ["claude"] });
      await writeGlobalLockfile([skillEntry("tdd")]);
      await writeSkillFile(".agents/skills/tdd/SKILL.md");

      expect((await removeGlobally(app)).status).toBe(200);

      expect(await existsUnderHome(".agents/skills/tdd/SKILL.md")).toBe(true);
    });

    it("reclaims nothing when apm never confirmed the removal", async () => {
      const { app } = makeApp({ detectedTools: ["codex"], removed: false });
      await writeGlobalLockfile([skillEntry("tdd")]);
      await writeSkillFile(".claude/skills/tdd/SKILL.md");

      expect((await removeGlobally(app)).status).toBe(502);

      expect(await existsUnderHome(".claude/skills/tdd/SKILL.md")).toBe(true);
    });

    it("answers per detected tool after a failed global removal", async () => {
      const { app } = makeApp({
        detectedTools: ["claude", "codex"],
        removed: false,
        realDeployedContent: true,
      });
      await writeGlobalLockfile([skillEntry("tdd")]);
      // Only Codex still has a copy: apm came off Claude Code and could not say so.
      await writeSkillFile(".agents/skills/tdd/SKILL.md");

      const response = await removeRequest(app, {
        type: "skill",
        name: "tdd",
        target: { kind: "global" },
        confirmedRemovalReceipt: await receiptFromGlobalPreflight(app),
      });

      expect(response.status).toBe(502);
      expect((await response.json()) as unknown).toMatchObject({
        outcome: {
          scope: "global",
          tools: [
            { tool: "claude", state: "removed" },
            { tool: "codex", state: "not-removed" },
          ],
        },
      });
    });

    it("refuses when the machine has no supported tool", async () => {
      const { app, removeCalls } = makeApp({ detectedTools: [] });
      await writeGlobalLockfile([skillEntry("tdd")]);

      const response = await removeGlobally(app);

      expect(response.status).toBe(409);
      expect(removeCalls).toEqual([]);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("no-supported-tool");
    });

    it("reports a skill the global scope does not carry as not found", async () => {
      const { app, removeCalls } = makeApp();
      await writeGlobalLockfile([skillEntry("jobs")]);

      expect((await removeGlobally(app)).status).toBe(404);
      expect(removeCalls).toEqual([]);
    });

    it("names what the removal would destroy before it runs", async () => {
      const { app, removeCalls } = makeApp({ deployedState: "unverifiable" });

      const response = await app.request("/api/deploy/remove/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "skill",
          name: "tdd",
          target: { kind: "global" },
        }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        check: {
          scope: "global",
          tools: [{ tool: "claude", warning: "cannot-verify-local-edits" }],
        },
        reclaim: null,
        receipt: expect.any(String),
      });
      expect(removeCalls).toEqual([]);
    });
  });

  describe("preflight", () => {
    const preflightTdd = (
      app: ReturnType<typeof makeApp>["app"],
      repoPath: string,
    ) =>
      app.request("/api/deploy/remove/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "skill",
          name: "tdd",
          target: { kind: "repo", repoPath },
        }),
      });

    it("names local edits as the thing a removal would destroy", async () => {
      const { app, registry, removeCalls } = makeApp({
        deployedState: "unverifiable",
      });
      await registry.register(repo);

      const response = await preflightTdd(app, repo);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        check: { scope: "repo", warning: "cannot-verify-local-edits" },
        reclaim: null,
        receipt: expect.any(String),
      });
      expect(removeCalls).toEqual([]);
    });

    it("keeps an unverifiable copy apart from a diverged one", async () => {
      const { app, registry } = makeApp({ deployedState: "unverifiable" });
      await registry.register(repo);

      expect(await (await preflightTdd(app, repo)).json()).toEqual({
        check: { scope: "repo", warning: "cannot-verify-local-edits" },
        reclaim: null,
        receipt: expect.any(String),
      });
    });

    // Refused, never priced: apm 0.29.0 aborts part-way through (#775).
    it("refuses a copy with local edits, offering nothing to confirm", async () => {
      const { app, registry, removeCalls } = makeApp({
        deployedState: "diverged",
      });
      await registry.register(repo);

      const response = await preflightTdd(app, repo);

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "deployed-diverged-from-lock",
      });
      expect(removeCalls).toEqual([]);
    });

    it("warns about nothing when the copy still matches its lockfile", async () => {
      const { app, registry } = makeApp({ deployedState: "clean" });
      await registry.register(repo);

      expect(await (await preflightTdd(app, repo)).json()).toEqual({
        check: { scope: "repo", warning: null },
        reclaim: null,
        receipt: expect.any(String),
      });
    });

    it("refuses an unregistered repo, so it cannot probe a lockfile", async () => {
      const { app } = makeApp({ deployedState: "unverifiable" });

      expect((await preflightTdd(app, repo)).status).toBe(403);
    });

    it("rejects a body that is not the expected shape", async () => {
      const { app } = makeApp();

      const response = await app.request("/api/deploy/remove/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "tdd" }),
      });

      expect(response.status).toBe(400);
    });
  });
});
