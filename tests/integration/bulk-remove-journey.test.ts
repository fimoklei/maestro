import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  type BulkRemoveReport,
  DeployedCleanupAdapter,
  DeployedLocation,
  DeployedRefAdapter,
  type DeployTarget,
  GlobalDeployStateReader,
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
import { stubDrift } from "../helpers/stub-drift";
import { stubFolderChooser } from "../helpers/stub-folder-chooser";
import { stubHarness } from "../helpers/stub-harness";
import { stubImport } from "../helpers/stub-import";
import { stubPromotes } from "../helpers/stub-promote";
import { stubPublish } from "../helpers/stub-publish";
import { stubScaffold } from "../helpers/stub-scaffold";
import { stubUpdate } from "../helpers/stub-update";

// The screen after the run (#409), so the fake apm deletes a target's
// lockfile with its last dependency, as real apm does.

const TOOLS: SupportedTool[] = ["claude", "codex"];

const globalFiles = (name: string) =>
  TOOLS.map((tool) =>
    tool === "claude"
      ? `.claude/skills/${name}/SKILL.md`
      : `.agents/skills/${name}/SKILL.md`,
  );

const lockfileFor = (names: string[], withFiles: boolean) =>
  [
    "lockfile_version: '1'",
    "dependencies:",
    ...names.flatMap((name) => [
      "- repo_url: fimoklei/agent-harness",
      "  host: github.com",
      "  resolved_ref: v0.5.1",
      `  virtual_path: .apm/skills/${name}`,
      "  package_type: claude_skill",
      ...(withFiles
        ? ["  deployed_files:", ...globalFiles(name).map((f) => `  - ${f}`)]
        : []),
    ]),
    "",
  ].join("\n");

describe("retiring a skill from every target it is deployed to", () => {
  let home: string;
  let repoA: string;
  let repoB: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-bulk-journey-home-"));
    repoA = await makeRepoDir("maestro-bulk-journey-repo-a-");
    repoB = await makeRepoDir("maestro-bulk-journey-repo-b-");
  });

  afterEach(async () => {
    for (const dir of [home, repoA, repoB]) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  function makeApp(failRepos: string[] = []) {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(home, "config.json"));
    const fails = new Set(failRepos);
    const state = new Map<string, string[]>();
    const location = new DeployedLocation({ HOME: home });
    const apmRoot = join(home, ".apm");

    const lockfilePath = (target: DeployTarget) =>
      target.kind === "repo"
        ? join(target.repoPath, "apm.lock.yaml")
        : join(apmRoot, "apm.lock.yaml");

    const key = (target: DeployTarget) =>
      target.kind === "repo" ? target.repoPath : "global";

    const writeLockfile = async (target: DeployTarget) => {
      const names = state.get(key(target)) ?? [];
      const path = lockfilePath(target);
      if (names.length === 0) {
        await rm(path, { force: true });
        return;
      }
      await mkdir(dirname(path), { recursive: true });
      await writeFile(
        path,
        lockfileFor(names, target.kind === "global"),
        "utf8",
      );
    };

    const locks = new InFlightLocks();
    const remove = new RemoveDeployedSkill({
      registry,
      locks,
      deployedRef: new DeployedRefAdapter({ fs, location }),
      deployedContent: {
        classify: async () => "clean" as const,
        contentDigest: async () => null,
      },
      apm: {
        removeSkill: async ({ target, ref }) => {
          if (target.kind === "repo" && fails.has(target.repoPath)) {
            throw new Error("apm uninstall failed: token in stderr");
          }
          const names = state.get(key(target)) ?? [];
          state.set(
            key(target),
            names.filter((name) => !ref.includes(`/skills/${name}#`)),
          );
          await writeLockfile(target);
          return { ok: true };
        },
      },
      deployedCleanup: new DeployedCleanupAdapter({ location }),
      toolPresence: { detectGlobalTools: async () => TOOLS },
      canonicalPath: (path) => fs.realpath(path),
      location,
    });

    const inventory = new InventoryReader({
      fs,
      resolvePath: () => undefined,
      readReleasedSkills: async () => [],
    });
    const app = createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      deployState: new GlobalDeployStateReader({
        fs,
        toolPresence: { detectGlobalTools: async () => TOOLS },
      }),
      deploy: stubDeploy({ inventory, registry, locks }),
      retryOperation: stubRetryOperation({ registry, locks }),
      remove,
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => apmRoot,
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      folderChooser: stubFolderChooser(),
      update: stubUpdate(),
      enforceOriginHost: false,
    });

    return {
      app,
      async deployTo(target: DeployTarget, names: string[]) {
        state.set(key(target), [...names]);
        await writeLockfile(target);
        if (target.kind === "repo") {
          await registry.register(target.repoPath);
        }
      },
    };
  }

  type App = ReturnType<typeof makeApp>["app"];

  const repoTarget = (repoPath: string): DeployTarget => ({
    kind: "repo",
    repoPath,
  });
  const globalTarget: DeployTarget = { kind: "global" };

  // Consent is per target and per priced cost (#364): a hand-built entry would
  // prove the walk, not the preflight→run contract.
  const entriesFor = async (app: App, targets: DeployTarget[]) => {
    const entries = [];
    for (const target of targets) {
      const response = await app.request("/api/deploy/remove/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "skill", name: "tdd", target }),
      });
      const { receipt } = (await response.json()) as { receipt?: string };
      entries.push({ target, confirmedRemovalReceipt: receipt });
    }
    return entries;
  };

  const repoNames = async (app: App, repoPath: string) => {
    const response = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repoPath)}`,
    );
    expect(response.status).toBe(200);
    const { primitives } = (await response.json()) as {
      primitives: { name: string }[];
    };
    return primitives.map((primitive) => primitive.name);
  };

  const globalNamesPerTool = async (app: App) => {
    const response = await app.request("/api/deploy-state/global");
    expect(response.status).toBe(200);
    const { tools } = (await response.json()) as {
      tools: { tool: string; primitives: { name: string }[] }[];
    };
    return tools.map((group) => ({
      tool: group.tool,
      names: group.primitives.map((primitive) => primitive.name),
    }));
  };

  it("clears the rows it removed and leaves the one it could not touch", async () => {
    const { app, deployTo } = makeApp([repoB]);
    await deployTo(globalTarget, ["tdd", "jobs"]);
    await deployTo(repoTarget(repoA), ["tdd"]);
    await deployTo(repoTarget(repoB), ["tdd", "jobs"]);

    const targets = await entriesFor(app, [
      globalTarget,
      repoTarget(repoA),
      repoTarget(repoB),
    ]);
    const response = await app.request("/api/deploy/remove/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "tdd", targets }),
    });

    expect(response.status).toBe(200);
    const report = (await response.json()) as BulkRemoveReport;
    expect(report.removed).toEqual([
      { target: globalTarget, version: "v0.5.1" },
      { target: repoTarget(repoA), version: "v0.5.1" },
    ]);
    expect(report.failed).toEqual([
      { target: repoTarget(repoB), reason: "remove-failed" },
    ]);
    expect(JSON.stringify(report)).not.toContain("token in stderr");

    expect(await globalNamesPerTool(app)).toEqual([
      { tool: "claude", names: ["jobs"] },
      { tool: "codex", names: ["jobs"] },
    ]);
    expect(await repoNames(app, repoA)).toEqual([]);
    expect(await repoNames(app, repoB)).toEqual(["tdd", "jobs"]);
  });
});
