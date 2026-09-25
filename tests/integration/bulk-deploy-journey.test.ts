// The whole bulk-deploy chain over the real Hono app (#1039). Only apm is faked.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type BulkDeployReport,
  DeployedContentAdapter,
  DeploySkill,
  GlobalDeployStateReader,
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import {
  rootPackageApm,
  rootPackageLocation,
  rootPackageSelection,
} from "../helpers/root-package-apm";
import { stubConnect } from "../helpers/stub-connect";
import { stubRetryOperation } from "../helpers/stub-deploy";
import { stubDrift } from "../helpers/stub-drift";
import { stubFolderChooser } from "../helpers/stub-folder-chooser";
import { stubHarness } from "../helpers/stub-harness";
import { stubImport } from "../helpers/stub-import";
import { stubPromotes } from "../helpers/stub-promote";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubScaffold } from "../helpers/stub-scaffold";
import { stubUpdate } from "../helpers/stub-update";

const SKILLS = ["tdd", "review", "docs"];

describe("bulk deploy journey", () => {
  let home: string;
  let globalRoot: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-bulk-journey-home-"));
    globalRoot = await mkdtemp(join(tmpdir(), "maestro-bulk-journey-global-"));
  });

  afterEach(async () => {
    for (const dir of [home, globalRoot]) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  function makeApp() {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => home,
      readReleasedSkills: async () =>
        SKILLS.map((name) => ({
          name,
          manifest: `---\nname: ${name}\ndescription: ${name} skill\n---\n`,
        })),
    });
    const locks = new InFlightLocks();
    const apm = rootPackageApm({ globalRoot });
    const deploy = new DeploySkill({
      inventory,
      registry,
      locks,
      apm: {
        resolveLatestTag: async () => ({ ok: true, tag: "v0.5.1" }),
        deploySkill: apm.deploySkill,
      },
      selection: rootPackageSelection({
        globalRoot,
        configPath: join(home, "config.json"),
        apm,
      }),
      inventoryGit: {
        syncBeforeDeploy: async () => {},
        skillExistsAtTag: async () => true,
        skillDivergesFromTag: async () => false,
        readSkillFilesAtTag: async () => null,
      },
      recordedPackage: { read: async () => ({ kind: "unverified" as const }) },
      deployedContent: new DeployedContentAdapter({
        location: rootPackageLocation(globalRoot),
      }),
      deployedCleanup: { removeSkillTargets: async () => undefined },
      toolPresence: { detectGlobalTools: async () => ["claude", "codex"] },
      canonicalPath: (path) => fs.realpath(path),
      inventoryOriginUrl: async () =>
        "git@github.com:fimoklei/agent-harness.git",
    });
    const app = createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      deployState: new GlobalDeployStateReader({
        fs,
        toolPresence: { detectGlobalTools: async () => ["claude", "codex"] },
        treeRoot: () => globalRoot,
      }),
      deploy,
      remove: stubRemove({ registry, locks }),
      retryOperation: stubRetryOperation({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => globalRoot,
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      folderChooser: stubFolderChooser(),
      update: stubUpdate(),
      enforceOriginHost: false,
    });
    return { app, installs: apm.installs };
  }

  const post = (
    app: ReturnType<typeof makeApp>["app"],
    path: string,
    body: unknown,
  ) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("installs the clean names at once and deploys the held one on its own receipt", async () => {
    await mkdir(join(globalRoot, ".claude/skills/docs"), { recursive: true });
    await writeFile(
      join(globalRoot, ".claude/skills/docs/SKILL.md"),
      "hand-written\n",
      "utf8",
    );
    const { app, installs } = makeApp();

    const bulk = await post(app, "/api/deploy/bulk", {
      names: SKILLS,
      target: { kind: "global" },
    });
    const report = (await bulk.json()) as BulkDeployReport;

    expect(report.deployed).toEqual([
      { name: "tdd", version: "v0.5.1" },
      { name: "review", version: "v0.5.1" },
    ]);
    expect(report.attention).toEqual([
      {
        name: "docs",
        error: "deployed-unverifiable",
        forceable: true,
        copyReceipt: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    ]);
    expect(installs.map((install) => install.skills)).toEqual([
      ["tdd", "review"],
    ]);

    const single = await post(app, "/api/deploy", {
      type: "skill",
      name: "docs",
      target: { kind: "global" },
      confirmedCopyReceipt: report.attention[0]?.copyReceipt,
    });
    expect(single.status).toBe(200);

    const state = await app.request("/api/deploy-state/global");
    const { tools } = (await state.json()) as {
      tools: { primitives: { name: string; version: string }[] }[];
    };
    const names = new Set(
      tools.flatMap((group) =>
        group.primitives.map((p) => `${p.name}@${p.version}`),
      ),
    );
    expect([...names].sort()).toEqual([
      "docs@v0.5.1",
      "review@v0.5.1",
      "tdd@v0.5.1",
    ]);
  });
});
