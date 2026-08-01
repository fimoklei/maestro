import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  type BulkRemoveReport,
  DeployedCleanupAdapter,
  DeployedLocation,
  DeployedRefAdapter,
  type DeployTarget,
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

// Integration lane: the bulk-remove route over the real Hono app, driving the
// real RemoveDeployedSkill (its guards intact) once per target. Only the apm
// driver is faked, so continue-and-harvest, the skipped refusals and the
// reclaim-token pass-through are exercised end to end.
const SKILL_FILE_CONTENT = "# tdd\n";

describe("bulk remove HTTP route", () => {
  let home: string;
  let repoA: string;
  let repoB: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-bulk-remove-home-"));
    repoA = await mkdtemp(join(tmpdir(), "maestro-bulk-remove-repo-a-"));
    repoB = await mkdtemp(join(tmpdir(), "maestro-bulk-remove-repo-b-"));
  });

  afterEach(async () => {
    for (const dir of [home, repoA, repoB]) {
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
      `  virtual_path: skills/${name}`,
      "  package_type: claude_skill",
    ].join("\n");

  function makeApp(options?: {
    // Repo paths whose apm removal throws, so a failure row can be proven
    // alongside successful targets.
    failRepos?: string[];
    // Repo paths where apm ran and did not confirm — the case that leaves a
    // disk probe to report.
    unprovenRepos?: string[];
    // Repo paths whose deployed copy carries local edits, so the guard has a
    // cost to price and a receipt to require (#458).
    divergedRepos?: string[];
  }) {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({ fs, resolvePath: () => undefined });
    const removeCalls: Array<{ target: DeployTarget; ref: string }> = [];
    const fails = new Set(options?.failRepos ?? []);
    const unproven = new Set(options?.unprovenRepos ?? []);
    const diverged = new Set(options?.divergedRepos ?? []);
    const location = new DeployedLocation({ HOME: home });
    const locks = new InFlightLocks();
    const remove = new RemoveDeployedSkill({
      registry,
      locks,
      deployedRef: new DeployedRefAdapter({ fs, location }),
      deployedContent: {
        classify: async ({ target }) =>
          target.kind === "repo" && diverged.has(target.repoPath)
            ? "diverged"
            : "clean",
      },
      apm: {
        removeSkill: async (input) => {
          removeCalls.push(input);
          if (input.target.kind !== "repo") {
            return { ok: true };
          }
          if (fails.has(input.target.repoPath)) {
            throw new Error("apm uninstall failed: token in stderr");
          }
          return { ok: !unproven.has(input.target.repoPath) };
        },
      },
      deployedCleanup: new DeployedCleanupAdapter({ location }),
      toolPresence: { detectGlobalTools: async () => ["codex"] },
      canonicalPath: (path) => fs.realpath(path),
      location,
    });
    const app = createApp({
      registry,
      inventory,
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry, locks }),
      remove,
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => join(home, ".apm"),
      connect: stubConnect(),
      browse: stubBrowse(),
      enforceOriginHost: false,
    });
    return { app, registry, removeCalls };
  }

  type App = ReturnType<typeof makeApp>["app"];

  const post = (app: App, body: unknown) =>
    app.request("/api/deploy/remove/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const globalTarget: DeployTarget = { kind: "global" };
  const repoTarget = (repoPath: string): DeployTarget => ({
    kind: "repo",
    repoPath,
  });

  async function writeRepoLockfile(repoPath: string) {
    await writeFile(
      join(repoPath, "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
  }

  async function writeGlobalLockfile() {
    await mkdir(join(home, ".apm"), { recursive: true });
    await writeFile(
      join(home, ".apm", "apm.lock.yaml"),
      lockfileWith([skillEntry("tdd")]),
      "utf8",
    );
  }

  async function writeSkillFile(relativePath: string) {
    const absolute = join(home, relativePath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, SKILL_FILE_CONTENT, "utf8");
  }

  const existsUnderHome = (relativePath: string) =>
    access(join(home, relativePath)).then(
      () => true,
      () => false,
    );

  // The token a real preflight against this app would return, so the bulk run
  // proves the actual preflight→run contract rather than a hand-built path.
  async function globalReclaimToken(app: App): Promise<string | undefined> {
    const response = await app.request("/api/deploy/remove/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "skill",
        name: "tdd",
        target: globalTarget,
      }),
    });
    const { reclaim } = (await response.json()) as {
      reclaim: { token: string } | null;
    };
    return reclaim?.token;
  }

  it("removes the skill from every target in one call and reports the successes", async () => {
    const { app, registry, removeCalls } = makeApp();
    await writeGlobalLockfile();
    await writeRepoLockfile(repoA);
    await registry.register(repoA);

    const response = await post(app, {
      name: "tdd",
      targets: [{ target: globalTarget }, { target: repoTarget(repoA) }],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "tdd",
      removed: [
        { target: globalTarget, version: "v0.5.1" },
        { target: repoTarget(repoA), version: "v0.5.1" },
      ],
      refused: [],
      failed: [],
    });
    // One apm call per target, in the order the request listed them.
    expect(removeCalls.map((call) => call.target)).toEqual([
      globalTarget,
      repoTarget(repoA),
    ]);
    expect(removeCalls.map((call) => call.ref)).toEqual([
      "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1",
      "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1",
    ]);
  });

  it("keeps going past a failing target and harvests every outcome", async () => {
    const { app, registry, removeCalls } = makeApp({ failRepos: [repoA] });
    await writeGlobalLockfile();
    await writeRepoLockfile(repoA);
    await writeRepoLockfile(repoB);
    await registry.register(repoA);
    await registry.register(repoB);

    const response = await post(app, {
      name: "tdd",
      targets: [
        { target: repoTarget(repoA) },
        { target: repoTarget(repoB) },
        { target: globalTarget },
      ],
    });

    expect(response.status).toBe(200);
    const report = (await response.json()) as BulkRemoveReport;
    expect(report.removed).toEqual([
      { target: repoTarget(repoB), version: "v0.5.1" },
      { target: globalTarget, version: "v0.5.1" },
    ]);
    expect(report.failed).toEqual([
      { target: repoTarget(repoA), reason: "remove-failed" },
    ]);
    // The batch reached the targets after the failure.
    expect(removeCalls).toHaveLength(3);
    // No raw apm output (which may carry a token) leaks into the report.
    expect(JSON.stringify(report)).not.toContain("token in stderr");
  });

  it("puts the disk probe of an unconfirmed removal on that target's row", async () => {
    // apm can come off a target and still fail to say so, so the row has to
    // carry what the probe found — never a bare failure (#416, J04).
    const { app, registry } = makeApp({ unprovenRepos: [repoA] });
    await writeRepoLockfile(repoA);
    await writeRepoLockfile(repoB);
    await registry.register(repoA);
    await registry.register(repoB);

    const response = await post(app, {
      name: "tdd",
      targets: [{ target: repoTarget(repoA) }, { target: repoTarget(repoB) }],
    });

    expect(response.status).toBe(200);
    const report = (await response.json()) as BulkRemoveReport;
    expect(report.failed).toEqual([
      {
        target: repoTarget(repoA),
        reason: "remove-failed",
        outcome: { scope: "repo", state: "not-removed" },
      },
    ]);
    expect(report.removed).toEqual([
      { target: repoTarget(repoB), version: "v0.5.1" },
    ]);
  });

  // Per target, both ways: the batch is the place where one target's answer
  // could quietly speak for the next one, so it must not (#458).
  it("keeps an unproven target out of apm and still finishes the batch", async () => {
    const { app, registry, removeCalls } = makeApp({ divergedRepos: [repoA] });
    await writeRepoLockfile(repoA);
    await writeRepoLockfile(repoB);
    await registry.register(repoA);
    await registry.register(repoB);

    const response = await post(app, {
      name: "tdd",
      targets: [{ target: repoTarget(repoA) }, { target: repoTarget(repoB) }],
    });

    const report = (await response.json()) as BulkRemoveReport;
    expect(report.failed).toEqual([
      { target: repoTarget(repoA), reason: "local-edits-unconfirmed" },
    ]);
    expect(report.removed).toEqual([
      { target: repoTarget(repoB), version: "v0.5.1" },
    ]);
    expect(removeCalls.map((call) => call.target)).toEqual([repoTarget(repoB)]);
  });

  it("removes that same target once its own preflight receipt rides along", async () => {
    const { app, registry, removeCalls } = makeApp({ divergedRepos: [repoA] });
    await writeRepoLockfile(repoA);
    await registry.register(repoA);

    const preflight = await app.request("/api/deploy/remove/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "skill",
        name: "tdd",
        target: repoTarget(repoA),
      }),
    });
    const { receipt } = (await preflight.json()) as { receipt: string };
    const response = await post(app, {
      name: "tdd",
      targets: [
        { target: repoTarget(repoA), confirmedRemovalReceipt: receipt },
      ],
    });

    const report = (await response.json()) as BulkRemoveReport;
    expect(report.removed).toEqual([
      { target: repoTarget(repoA), version: "v0.5.1" },
    ]);
    expect(removeCalls).toHaveLength(1);
  });

  it("rejects a receipt that is not even token-shaped, at the edge", async () => {
    const { app, registry, removeCalls } = makeApp({ divergedRepos: [repoA] });
    await writeRepoLockfile(repoA);
    await registry.register(repoA);

    const response = await post(app, {
      name: "tdd",
      targets: [{ target: repoTarget(repoA), confirmedRemovalReceipt: "nope" }],
    });

    expect(response.status).toBe(400);
    expect(removeCalls).toEqual([]);
  });

  it("fails an unregistered repo without letting apm or its lockfile be touched", async () => {
    const { app, registry, removeCalls } = makeApp();
    await writeRepoLockfile(repoA);
    await writeRepoLockfile(repoB);
    await registry.register(repoA);

    const response = await post(app, {
      name: "tdd",
      targets: [{ target: repoTarget(repoB) }, { target: repoTarget(repoA) }],
    });

    expect(response.status).toBe(200);
    const report = (await response.json()) as BulkRemoveReport;
    expect(report.failed).toEqual([
      { target: repoTarget(repoB), reason: "repo-not-registered" },
    ]);
    expect(report.removed).toEqual([
      { target: repoTarget(repoA), version: "v0.5.1" },
    ]);
    expect(removeCalls.map((call) => call.target)).toEqual([repoTarget(repoA)]);
  });

  it("skips a target the caller marked refused and still reports it", async () => {
    const { app, registry, removeCalls } = makeApp();
    await writeRepoLockfile(repoA);
    await writeRepoLockfile(repoB);
    await registry.register(repoA);
    await registry.register(repoB);

    const response = await post(app, {
      name: "tdd",
      targets: [
        { target: repoTarget(repoA), refused: "preflight-failed" },
        { target: repoTarget(repoB) },
      ],
    });

    expect(response.status).toBe(200);
    const report = (await response.json()) as BulkRemoveReport;
    expect(report.refused).toEqual([
      { target: repoTarget(repoA), reason: "preflight-failed" },
    ]);
    expect(report.removed).toEqual([
      { target: repoTarget(repoB), version: "v0.5.1" },
    ]);
    expect(removeCalls.map((call) => call.target)).toEqual([repoTarget(repoB)]);
  });

  it("reclaims the global target's leftover copy from the token its preflight issued", async () => {
    const { app, registry } = makeApp();
    await writeGlobalLockfile();
    await writeRepoLockfile(repoA);
    await registry.register(repoA);
    // Claude Code is undetected, so the copy it holds is a leftover apm's own
    // uninstall never reaches (#390).
    await writeSkillFile(".claude/skills/tdd/SKILL.md");
    const confirmedReclaimToken = await globalReclaimToken(app);

    const response = await post(app, {
      name: "tdd",
      targets: [
        { target: globalTarget, confirmedReclaimToken },
        { target: repoTarget(repoA) },
      ],
    });

    expect(response.status).toBe(200);
    expect(await existsUnderHome(".claude/skills/tdd")).toBe(false);
  });

  it("leaves the leftover copy alone when no token confirmed it", async () => {
    const { app } = makeApp();
    await writeGlobalLockfile();
    await writeSkillFile(".claude/skills/tdd/SKILL.md");

    const response = await post(app, {
      name: "tdd",
      targets: [{ target: globalTarget }],
    });

    expect(response.status).toBe(200);
    expect(await existsUnderHome(".claude/skills/tdd/SKILL.md")).toBe(true);
  });

  it("returns 400 for a body without a targets array", async () => {
    const { app } = makeApp();

    expect((await post(app, { name: "tdd" })).status).toBe(400);
  });

  it("returns 400 for a refusal reason outside the known vocabulary", async () => {
    const { app } = makeApp();

    const response = await post(app, {
      name: "tdd",
      targets: [
        { target: repoTarget(repoA), refused: "<script>alert(1)</script>" },
      ],
    });

    expect(response.status).toBe(400);
  });

  it("takes no path from the client for the global target", async () => {
    const { app, removeCalls } = makeApp();
    await writeGlobalLockfile();

    const response = await post(app, {
      name: "tdd",
      targets: [{ target: { kind: "global", repoPath: "/etc" } }],
    });

    expect(response.status).toBe(200);
    expect(removeCalls.map((call) => call.target)).toEqual([globalTarget]);
  });
});
