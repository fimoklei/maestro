import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type BulkDeployReport,
  ConfigStore,
  DeploySkill,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";

// Integration lane: the bulk-deploy route over the real Hono app, driving the
// real DeploySkill (its guards intact) once per staged skill. Only the ApmDriver
// and the destination classifier are faked, per skill, so continue-and-harvest,
// attention-marking, and failure-merging are exercised end to end.
describe("bulk deploy HTTP route", () => {
  let home: string;
  let harness: string;
  let globalRoot: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-bulk-home-"));
    harness = await mkdtemp(join(tmpdir(), "maestro-bulk-harness-"));
    globalRoot = await mkdtemp(join(tmpdir(), "maestro-bulk-global-"));
    for (const name of ["tdd", "review", "docs"]) {
      await mkdir(join(harness, "skills", name), { recursive: true });
      await writeFile(
        join(harness, "skills", name, "SKILL.md"),
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
    const registry = new Registry({
      fs,
      store: new ConfigStore({ fs, configPath: join(home, "config.json") }),
    });
    const inventory = new InventoryReader({ fs, resolvePath: () => harness });
    const diverged = new Set(options?.divergedNames ?? []);
    const fails = new Set(options?.failNames ?? []);
    const deploy = new DeploySkill({
      inventory,
      registry,
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
          return { ok: true };
        },
      },
      inventoryGit: {
        skillExistsAtTag: async () => true,
        skillDivergesFromTag: async () => false,
      },
      deployedContent: {
        classify: async ({ name }) =>
          diverged.has(name) ? "diverged" : "not-deployed",
      },
      deployedCleanup: { removeSkillTargets: async () => undefined },
      toolPresence: { detectGlobalTools: async () => ["claude", "codex"] },
      canonicalPath: (path) => fs.realpath(path),
      inventoryOriginUrl: async () =>
        "git@github.com:fimoklei/agent-harness.git",
    });
    const app = createApp({
      registry,
      inventory,
      deployState: stubDeployState({ fs }),
      deploy,
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => globalRoot,
      connect: stubConnect(),
      browse: stubBrowse(),
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
      { name: "review", error: "deployed-diverged-from-lock" },
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

  it("returns 400 for a body without a names array", async () => {
    const { app } = makeApp();

    const res = await post(app, { target: { kind: "global" } });

    expect(res.status).toBe(400);
  });
});
