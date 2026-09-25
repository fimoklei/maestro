import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeploySkill,
  GlobalDeployStateReader,
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { makeRepoDir } from "../helpers/repo-dir";
import {
  rootPackageApm,
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

// Each step is covered elsewhere; this file proves they chain.

const LATEST_TAG = "v0.5.1";

describe("the tracer journey through one cockpit", () => {
  let home: string;
  let harness: string;
  let repo: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-tracer-home-"));
    harness = await mkdtemp(join(tmpdir(), "maestro-tracer-harness-"));
    repo = await makeRepoDir("maestro-tracer-repo-");
    await mkdir(join(harness, ".apm", "skills", "tdd"), { recursive: true });
    await writeFile(join(harness, "apm.yml"), "dependencies: []\n", "utf8");
    await writeFile(
      join(harness, ".apm", "skills", "tdd", "SKILL.md"),
      "---\nname: tdd\ndescription: Test-driven development loop\n---\n",
      "utf8",
    );
  });

  afterEach(async () => {
    for (const dir of [home, harness, repo]) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  function makeApp() {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => harness,
      // Released, not merely on disk: Inventory answers from the release (#841).
      readReleasedSkills: async () => [
        {
          name: "tdd",
          manifest:
            "---\nname: tdd\ndescription: Test-driven development loop\n---\n",
        },
      ],
    });
    const locks = new InFlightLocks();
    // The read-back reads files this deploy wrote, not a typed lockfile.
    const apm = rootPackageApm({ globalRoot: join(home, ".apm") });
    const deploy = new DeploySkill({
      inventory,
      registry,
      locks,
      apm: {
        resolveLatestTag: async () => ({ ok: true, tag: LATEST_TAG }),
        deploySkill: apm.deploySkill,
      },
      selection: rootPackageSelection({
        globalRoot: join(home, ".apm"),
        configPath: join(home, "config.json"),
        apm,
      }),
      inventoryGit: {
        syncBeforeDeploy: async () => {},
        skillExistsAtTag: async () => true,
        skillDivergesFromTag: async () => false,
        readSkillFilesAtTag: async () => null,
      },
      recordedPackage: {
        read: async () => ({
          kind: "recorded" as const,
          reading: { kind: "skill" as const, name: "tdd" },
        }),
      },
      deployedContent: {
        contentDigest: async () => null,
        classify: async () => "not-deployed" as const,
        linkedSkillPath: async () => null,
      },
      deployedCleanup: { removeSkillTargets: async () => undefined },
      toolPresence: { detectGlobalTools: async () => ["claude"] },
      canonicalPath: (path) => fs.realpath(path),
      inventoryOriginUrl: async () =>
        "git@github.com:fimoklei/agent-harness.git",
    });
    return createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      deployState: new GlobalDeployStateReader({
        fs,
        toolPresence: { detectGlobalTools: async () => ["claude"] },
      }),
      deploy,
      remove: stubRemove({ registry, locks }),
      retryOperation: stubRetryOperation({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => join(home, ".apm"),
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      folderChooser: stubFolderChooser(),
      update: stubUpdate(),
      enforceOriginHost: false,
    });
  }

  it("registers a repo, lists the inventory, deploys into it, and reads it back", async () => {
    const app = makeApp();
    const postJson = (path: string, body: unknown) =>
      app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const registered = await postJson("/api/registry/repos", { path: repo });
    expect(registered.status).toBe(201);
    const { repos } = (await registered.json()) as {
      repos: { path: string }[];
    };
    const registeredPath = repos[0]?.path;
    expect(registeredPath).toBeDefined();

    const inventory = await app.request("/api/inventory/primitives");
    expect(await inventory.json()).toEqual({
      primitives: [
        {
          type: "skill",
          name: "tdd",
          description: "Test-driven development loop",
        },
      ],
    });

    // The path comes from the registry's own answer.
    const deployed = await postJson("/api/deploy", {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: registeredPath },
    });
    expect(deployed.status).toBe(200);
    expect(await deployed.json()).toEqual({
      deployed: { type: "skill", name: "tdd", version: LATEST_TAG },
    });

    const state = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );
    expect(state.status).toBe(200);
    expect(await state.json()).toMatchObject({
      primitives: [{ type: "skill", name: "tdd", version: LATEST_TAG }],
    });
  });
});
