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
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDrift } from "../helpers/stub-drift";
import { stubHarness } from "../helpers/stub-harness";
import { stubImport } from "../helpers/stub-import";
import { stubPromotes } from "../helpers/stub-promote";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubScaffold } from "../helpers/stub-scaffold";

// The tracer journey end to end: register, see, deploy, see it back. Each step
// is covered on its own elsewhere; what only this file proves is that they
// chain — the deploy reaches a repo the registration put in the registry, and
// the read-back finds the lockfile that same deploy wrote.

const LATEST_TAG = "v0.5.1";

// What apm writes into the target after a repo install.
const lockfileAtTag = (tag: string) =>
  [
    "lockfile_version: '1'",
    "dependencies:",
    "- repo_url: fimoklei/agent-harness",
    "  host: github.com",
    `  resolved_ref: ${tag}`,
    "  virtual_path: .apm/skills/tdd",
    "  package_type: claude_skill",
    "  deployed_files:",
    "  - .claude/skills/tdd",
    "",
  ].join("\n");

describe("the tracer journey through one cockpit", () => {
  let home: string;
  let harness: string;
  let repo: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-tracer-home-"));
    harness = await mkdtemp(join(tmpdir(), "maestro-tracer-harness-"));
    repo = await mkdtemp(join(tmpdir(), "maestro-tracer-repo-"));
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

  // One app for the whole journey: the same registry, inventory and filesystem
  // carry state from one step to the next, which is the point of the tracer.
  function makeApp() {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({ fs, resolvePath: () => harness });
    const locks = new InFlightLocks();
    const deploy = new DeploySkill({
      inventory,
      registry,
      locks,
      apm: {
        resolveLatestTag: async () => ({ ok: true, tag: LATEST_TAG }),
        deploySkill: async (input) => {
          if (input.target.kind !== "repo") {
            throw new Error("the tracer journey only deploys to a repo");
          }
          await writeFile(
            join(input.target.repoPath, "apm.lock.yaml"),
            lockfileAtTag(LATEST_TAG),
            "utf8",
          );
          return { ok: true };
        },
      },
      inventoryGit: {
        syncBeforeDeploy: async () => {},
        skillExistsAtTag: async () => true,
        skillDivergesFromTag: async () => false,
      },
      // A proven skill record: this journey is not about the post-install read.
      recordedPackage: {
        read: async () => ({
          kind: "recorded" as const,
          reading: { kind: "skill" as const, name: "tdd" },
        }),
      },
      deployedContent: { classify: async () => "not-deployed" as const },
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
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => join(home, ".apm"),
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      browse: stubBrowse(),
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

    // J10 — the repo I work in joins the registered list.
    const registered = await postJson("/api/registry/repos", { path: repo });
    expect(registered.status).toBe(201);
    const { repos } = (await registered.json()) as {
      repos: { path: string }[];
    };
    const registeredPath = repos[0]?.path;
    expect(registeredPath).toBeDefined();

    // J01 — the inventory shows what there is to deploy.
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

    // J06 — one action deploys it into the repo registered a moment ago. The
    // path comes from the registry's own answer, so a deploy that only works
    // against a hand-spelled path would fail here.
    const deployed = await postJson("/api/deploy", {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: registeredPath },
    });
    expect(deployed.status).toBe(200);
    expect(await deployed.json()).toEqual({
      deployed: { type: "skill", name: "tdd", version: LATEST_TAG },
    });

    // J02 — the same repo now reads back the skill at the tag it was pinned to.
    const state = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );
    expect(state.status).toBe(200);
    expect(await state.json()).toMatchObject({
      primitives: [{ type: "skill", name: "tdd", version: LATEST_TAG }],
    });
  });
});
