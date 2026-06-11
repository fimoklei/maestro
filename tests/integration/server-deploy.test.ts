import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigStore,
  DeploySkill,
  DeployStateReader,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Integration lane: the deploy route over the real Hono app, real temp dirs,
// real inventory files. Only the ApmDriver is faked — its deploySkill writes
// the captured real lockfile into the target repo, the same contract the
// acceptance journey relies on. Origin/Host guard enforcement lives in
// server-security.test.ts.
describe("deploy HTTP route", () => {
  let home: string;
  let harness: string;
  let repo: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-deploy-home-"));
    harness = await mkdtemp(join(tmpdir(), "maestro-harness-"));
    repo = await mkdtemp(join(tmpdir(), "maestro-target-"));
    await mkdir(join(harness, "skills", "tdd"), { recursive: true });
    await writeFile(
      join(harness, "skills", "tdd", "SKILL.md"),
      "---\nname: tdd\ndescription: Test-driven development\n---\n",
      "utf8",
    );
  });

  afterEach(async () => {
    for (const dir of [home, harness, repo]) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  const capturedLockfile = (ref: string) =>
    [
      "lockfile_version: '1'",
      "apm_version: 0.16.0",
      "dependencies:",
      "- repo_url: fimoklei/agent-harness",
      "  host: github.com",
      "  resolved_commit: 471c4b26471c4b26471c4b26471c4b26471c4b26",
      `  resolved_ref: ${ref}`,
      "  virtual_path: skills/tdd",
      "  is_virtual: true",
      "  package_type: claude_skill",
      "  deployed_files:",
      "  - .claude/skills/tdd",
      "  content_hash: sha256:abc",
      "",
    ].join("\n");

  function makeApp(options?: {
    failApm?: boolean;
    skillAtTag?: boolean;
    diverged?: boolean;
    holdApm?: Promise<void>;
  }) {
    const fs = new NodeFileSystem();
    const registry = new Registry({
      fs,
      store: new ConfigStore({ fs, configPath: join(home, "config.json") }),
    });
    const inventory = new InventoryReader({ fs, resolvePath: () => harness });
    const deployState = new DeployStateReader({ fs });
    const deployCalls: Array<{ repoPath: string; ref: string }> = [];
    const deploy = new DeploySkill({
      inventory,
      registry,
      apm: {
        resolveLatestTag: async () => "v0.5.1",
        deploySkill: async (input) => {
          if (options?.failApm) {
            throw new Error("apm install failed: token in stderr");
          }
          if (options?.holdApm) {
            await options.holdApm;
          }
          deployCalls.push(input);
          await writeFile(
            join(input.repoPath, "apm.lock.yaml"),
            capturedLockfile("v0.5.1"),
            "utf8",
          );
        },
      },
      inventoryGit: {
        skillExistsAtTag: async () => options?.skillAtTag ?? true,
        skillDivergesFromTag: async () => options?.diverged ?? false,
      },
      canonicalPath: (path) => fs.realpath(path),
      inventoryOriginUrl: async () =>
        "git@github.com:fimoklei/agent-harness.git",
    });
    const app = createApp({
      registry,
      inventory,
      deployState,
      deploy,
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      enforceOriginHost: false,
    });
    return { app, registry, deployCalls };
  }

  const post = (app: ReturnType<typeof makeApp>["app"], body: unknown) =>
    app.request("/api/deploy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("deploys a skill into a registered repo at the latest tag", async () => {
    const { app, registry, deployCalls } = makeApp();
    await registry.register(repo);

    const res = await post(app, { type: "skill", name: "tdd", repoPath: repo });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
    expect(deployCalls).toEqual([
      {
        repoPath: repo,
        ref: "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1",
      },
    ]);
    // The deploy-state read now sees the skill at its tag — the see-back half.
    expect(await readFile(join(repo, "apm.lock.yaml"), "utf8")).toContain(
      "v0.5.1",
    );
  });

  it("refuses to deploy into a repo that is not registered", async () => {
    const { app, deployCalls } = makeApp();

    const res = await post(app, { type: "skill", name: "tdd", repoPath: repo });

    expect(res.status).toBe(403);
    expect(deployCalls).toEqual([]);
  });

  it("returns 404 for a skill that is not in the inventory", async () => {
    const { app, registry } = makeApp();
    await registry.register(repo);

    const res = await post(app, {
      type: "skill",
      name: "nope",
      repoPath: repo,
    });

    expect(res.status).toBe(404);
  });

  it("returns 422 with an honest message for a non-skill type", async () => {
    const { app, registry, deployCalls } = makeApp();
    await registry.register(repo);

    const res = await post(app, { type: "hook", name: "tdd", repoPath: repo });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "unsupported-primitive-type",
      message: expect.stringMatching(/skill/i),
    });
    expect(deployCalls).toEqual([]);
  });

  it("returns 400 for an invalid body", async () => {
    const { app } = makeApp();

    const res = await post(app, { name: "tdd" });

    expect(res.status).toBe(400);
  });

  it("returns 400 for a name that is not a strict slug", async () => {
    const { app, registry, deployCalls } = makeApp();
    await registry.register(repo);

    const res = await post(app, {
      type: "skill",
      name: "../escape",
      repoPath: repo,
    });

    expect(res.status).toBe(400);
    expect(deployCalls).toEqual([]);
  });

  it("returns 422 when the latest tag does not contain the skill", async () => {
    const { app, registry, deployCalls } = makeApp({ skillAtTag: false });
    await registry.register(repo);

    const res = await post(app, { type: "skill", name: "tdd", repoPath: repo });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "no-published-tag",
      message: expect.stringMatching(/tag/i),
    });
    expect(deployCalls).toEqual([]);
  });

  it("returns 409 when the local skill diverges from the latest tag", async () => {
    const { app, registry, deployCalls } = makeApp({ diverged: true });
    await registry.register(repo);

    const res = await post(app, { type: "skill", name: "tdd", repoPath: repo });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "local-diverged-from-tag",
      message: expect.stringMatching(/tag/i),
    });
    expect(deployCalls).toEqual([]);
  });

  it("returns 409 for a concurrent deploy to the same repo", async () => {
    let release: () => void = () => undefined;
    const holdApm = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { app, registry, deployCalls } = makeApp({ holdApm });
    await registry.register(repo);

    const first = post(app, { type: "skill", name: "tdd", repoPath: repo });
    // Give the first request time to pass the lock before the second lands.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await post(app, {
      type: "skill",
      name: "tdd",
      repoPath: repo,
    });

    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({
      error: "deploy-in-progress",
      message: expect.stringMatching(/\S/),
    });

    release();
    expect((await first).status).toBe(200);
    expect(deployCalls).toHaveLength(1);
  });

  it("returns a sanitized 502 when apm fails, never leaking its output", async () => {
    const { app, registry } = makeApp({ failApm: true });
    await registry.register(repo);

    const res = await post(app, { type: "skill", name: "tdd", repoPath: repo });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({
      error: "deploy-failed",
      message: expect.stringMatching(/\S/),
    });
    // The raw apm error (which may carry a token) never reaches the client.
    expect(JSON.stringify(body)).not.toContain("token in stderr");
  });
});
