import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type BulkDeployReport,
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
import { stubUpdate } from "../helpers/stub-update";

// Integration lane: the bulk-deploy route over the real Hono app, driving the
// real DeploySkill (its guards intact) once per staged skill. Only the ApmDriver
// and the destination classifier are faked, per skill, so continue-and-harvest,
// attention-marking, and failure-merging are exercised end to end.
// A user-scope lockfile carrying one claude_skill dependency per name, the
// shape apm accumulates across successive global installs.
const globalLockfile = (names: string[]) =>
  [
    "lockfile_version: '1'",
    "dependencies:",
    ...names.flatMap((name) => [
      "- repo_url: fimoklei/agent-harness",
      "  host: github.com",
      "  resolved_ref: v0.5.1",
      `  virtual_path: .apm/skills/${name}`,
      "  package_type: claude_skill",
      // The per-tool attribution the global read groups by (#187).
      "  deployed_files:",
      `  - .claude/skills/${name}`,
      `  - .agents/skills/${name}`,
    ]),
    "",
  ].join("\n");

describe("bulk deploy HTTP route", () => {
  let home: string;
  let harness: string;
  let globalRoot: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-bulk-home-"));
    harness = await mkdtemp(join(tmpdir(), "maestro-bulk-harness-"));
    globalRoot = await mkdtemp(join(tmpdir(), "maestro-bulk-global-"));
    for (const name of ["tdd", "review", "docs"]) {
      await mkdir(join(harness, ".apm", "skills", name), { recursive: true });
      await writeFile(
        join(harness, ".apm", "skills", name, "SKILL.md"),
        `---\nname: ${name}\ndescription: ${name} skill\n---\n`,
        "utf8",
      );
    }
  });

  afterEach(async () => {
    for (const dir of [home, harness, globalRoot]) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  function makeApp(options?: {
    authRequired?: boolean;
    // Names whose deployed copy is diverged (destination guard → attention).
    divergedNames?: string[];
    // Names whose apm install throws (a hard failure → failed).
    failNames?: string[];
  }) {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => harness,
      // Released, not merely on disk: Inventory answers from the release (#841).
      readReleasedSkills: async () =>
        ["tdd", "review", "docs"].map((name) => ({
          name,
          manifest: `---\nname: ${name}\ndescription: ${name} skill\n---\n`,
        })),
    });
    const diverged = new Set(options?.divergedNames ?? []);
    const fails = new Set(options?.failNames ?? []);
    // What apm leaves behind: the user-scope lockfile grows one entry per
    // successful install, exactly where the global deploy-state read looks.
    const installed: string[] = [];
    const locks = new InFlightLocks();
    const deploy = new DeploySkill({
      inventory,
      registry,
      locks,
      apm: {
        resolveLatestTag: async () =>
          options?.authRequired
            ? { ok: false, reason: "auth-required" }
            : { ok: true, tag: "v0.5.1" },
        deploySkill: async (input) => {
          const failing = [...fails].some((name) =>
            input.ref.includes(`/skills/${name}#`),
          );
          if (failing) {
            throw new Error("apm install failed: token in stderr");
          }
          const name = input.ref.match(/\/skills\/([^#]+)#/)?.[1];
          if (name === undefined) {
            // A fake that silently records an unnamed entry would let the
            // read-back assert against a lockfile no install could produce.
            throw new Error(`unexpected deploy ref shape: ${input.ref}`);
          }
          installed.push(name);
          await writeFile(
            join(globalRoot, "apm.lock.yaml"),
            globalLockfile(installed),
            "utf8",
          );
          return { ok: true };
        },
      },
      inventoryGit: {
        syncBeforeDeploy: async () => {},
        skillExistsAtTag: async () => true,
        skillDivergesFromTag: async () => false,
        readSkillFilesAtTag: async () => null,
      },
      // A proven skill record: this journey is not about the post-install read.
      recordedPackage: {
        read: async () => ({
          kind: "recorded" as const,
          reading: { kind: "skill" as const, name: "tdd" },
        }),
      },
      deployedContent: {
        classify: async ({ name }) =>
          diverged.has(name) ? "diverged" : "not-deployed",
        linkedSkillPath: async () => null,
      },
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
      }),
      deploy,
      remove: stubRemove({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => globalRoot,
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      browse: stubBrowse(),
      update: stubUpdate(),
      enforceOriginHost: false,
    });
    return { app };
  }

  const post = (app: ReturnType<typeof makeApp>["app"], body: unknown) =>
    app.request("/api/deploy/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("deploys every staged skill to the target and reports the successes", async () => {
    const { app } = makeApp();

    const res = await post(app, {
      names: ["tdd", "review"],
      target: { kind: "global" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      target: { kind: "global" },
      deployed: [
        { name: "tdd", version: "v0.5.1" },
        { name: "review", version: "v0.5.1" },
      ],
      attention: [],
      failed: [],
    });
  });

  it("keeps going past a failure and harvests every outcome", async () => {
    const { app } = makeApp({ divergedNames: ["review"], failNames: ["docs"] });

    const res = await post(app, {
      names: ["tdd", "review", "docs"],
      target: { kind: "global" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as BulkDeployReport;
    expect(body.deployed).toEqual([{ name: "tdd", version: "v0.5.1" }]);
    expect(body.attention).toEqual([
      {
        name: "review",
        error: "deployed-diverged-from-lock",
        forceable: true,
        // The row's own consent, so its inline deploy grants no more than the
        // reader was shown (#952).
        copyReceipt: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    ]);
    expect(body.failed).toEqual([{ error: "deploy-failed", names: ["docs"] }]);
    // No raw apm output (which may carry a token) leaks into the report.
    expect(JSON.stringify(body)).not.toContain("token in stderr");
  });

  it("merges identical failures into one line carrying every affected skill", async () => {
    const { app } = makeApp({ authRequired: true });

    const res = await post(app, {
      names: ["tdd", "review"],
      target: { kind: "global" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as BulkDeployReport;
    expect(body.failed).toEqual([
      { error: "auth-required", names: ["tdd", "review"] },
    ]);
    expect(body.deployed).toEqual([]);
  });

  // The deployed names the global deploy-state route reads back, deduped
  // across tool groups — a two-tool skill lands in both.
  const globalNames = async (app: ReturnType<typeof makeApp>["app"]) => {
    const res = await app.request("/api/deploy-state/global");
    const { tools } = (await res.json()) as {
      tools: { primitives: { name: string; version: string }[] }[];
    };
    return [
      ...new Set(
        tools.flatMap((group) =>
          group.primitives.map((p) => `${p.name}@${p.version}`),
        ),
      ),
    ];
  };

  it("puts every deployed skill into the global deploy-state read", async () => {
    const { app } = makeApp();

    await post(app, { names: ["tdd", "review"], target: { kind: "global" } });

    expect(await globalNames(app)).toEqual(["tdd@v0.5.1", "review@v0.5.1"]);
  });

  it("leaves the failed skill out of the baseline while the rest lands", async () => {
    const { app } = makeApp({ failNames: ["review"] });

    await post(app, { names: ["tdd", "review"], target: { kind: "global" } });

    expect(await globalNames(app)).toEqual(["tdd@v0.5.1"]);
  });

  it("returns 400 for a body without a names array", async () => {
    const { app } = makeApp();

    const res = await post(app, { target: { kind: "global" } });

    expect(res.status).toBe(400);
  });
});
