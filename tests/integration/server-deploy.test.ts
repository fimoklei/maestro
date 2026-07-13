import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigStore,
  DeploySkill,
  DeployStateReader,
  type DeployTarget,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDrift } from "../helpers/stub-drift";

// Integration lane: the deploy route over the real Hono app, real temp dirs,
// real inventory files. Only the ApmDriver is faked — its deploySkill writes
// the captured real lockfile into the target (repo or global root), the same
// contract the acceptance journey relies on. Origin/Host guard enforcement
// lives in server-security.test.ts.
describe("deploy HTTP route", () => {
  let home: string;
  let harness: string;
  let repo: string;
  let globalRoot: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-deploy-home-"));
    harness = await mkdtemp(join(tmpdir(), "maestro-harness-"));
    repo = await mkdtemp(join(tmpdir(), "maestro-target-"));
    globalRoot = await mkdtemp(join(tmpdir(), "maestro-global-"));
    await mkdir(join(harness, "skills", "tdd"), { recursive: true });
    await writeFile(
      join(harness, "skills", "tdd", "SKILL.md"),
      "---\nname: tdd\ndescription: Test-driven development\n---\n",
      "utf8",
    );
  });

  afterEach(async () => {
    for (const dir of [home, harness, repo, globalRoot]) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  const repoTarget = (repoPath: string): DeployTarget => ({
    kind: "repo",
    repoPath,
  });
  const globalTarget: DeployTarget = { kind: "global" };

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
    authRequired?: boolean;
    skillAtTag?: boolean;
    diverged?: boolean;
    destDiverged?: boolean;
    destUnverifiable?: boolean;
    destUnreadable?: boolean;
    destLockfileMalformed?: boolean;
    holdApm?: Promise<void>;
  }) {
    const fs = new NodeFileSystem();
    const registry = new Registry({
      fs,
      store: new ConfigStore({ fs, configPath: join(home, "config.json") }),
    });
    const inventory = new InventoryReader({ fs, resolvePath: () => harness });
    const deployState = new DeployStateReader({ fs });
    const deployCalls: Array<{ target: DeployTarget; ref: string }> = [];
    const deploy = new DeploySkill({
      inventory,
      registry,
      apm: {
        resolveLatestTag: async () =>
          options?.authRequired
            ? { ok: false, reason: "auth-required" }
            : { ok: true, tag: "v0.5.1" },
        deploySkill: async (input) => {
          if (options?.failApm) {
            throw new Error("apm install failed: token in stderr");
          }
          if (options?.holdApm) {
            await options.holdApm;
          }
          deployCalls.push(input);
          // Where the lockfile lands mirrors apm: the repo for a repo install,
          // the user-scope root for a global one.
          const dest =
            input.target.kind === "repo" ? input.target.repoPath : globalRoot;
          await writeFile(
            join(dest, "apm.lock.yaml"),
            capturedLockfile("v0.5.1"),
            "utf8",
          );
        },
      },
      inventoryGit: {
        skillExistsAtTag: async () => options?.skillAtTag ?? true,
        skillDivergesFromTag: async () => options?.diverged ?? false,
      },
      deployedContent: {
        classify: async () => {
          if (options?.destLockfileMalformed) return "lockfile-malformed";
          if (options?.destUnreadable) return "unreadable";
          if (options?.destUnverifiable) return "unverifiable";
          return options?.destDiverged ? "diverged" : "not-deployed";
        },
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
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => globalRoot,
      connect: stubConnect(),
      browse: stubBrowse(),
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

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
    expect(deployCalls).toEqual([
      {
        target: repoTarget(repo),
        ref: "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1",
      },
    ]);
    // The deploy-state read now sees the skill at its tag — the see-back half.
    expect(await readFile(join(repo, "apm.lock.yaml"), "utf8")).toContain(
      "v0.5.1",
    );
  });

  it("deploys a skill globally, with no repo registered", async () => {
    // Global crosses no client path, so it needs no registry entry: the deploy
    // succeeds against zero registered repos (J07).
    const { app, deployCalls } = makeApp();

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
    expect(deployCalls).toEqual([
      {
        target: globalTarget,
        ref: "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1",
      },
    ]);
    expect(await readFile(join(globalRoot, "apm.lock.yaml"), "utf8")).toContain(
      "v0.5.1",
    );
  });

  it("refuses to deploy into a repo that is not registered", async () => {
    const { app, deployCalls } = makeApp();

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(403);
    expect(deployCalls).toEqual([]);
  });

  it("returns 404 for a skill that is not in the inventory", async () => {
    const { app, registry } = makeApp();
    await registry.register(repo);

    const res = await post(app, {
      type: "skill",
      name: "nope",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(404);
  });

  it("returns 422 with an honest message for a non-skill type", async () => {
    const { app, registry, deployCalls } = makeApp();
    await registry.register(repo);

    const res = await post(app, {
      type: "hook",
      name: "tdd",
      target: repoTarget(repo),
    });

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
      target: repoTarget(repo),
    });

    expect(res.status).toBe(400);
    expect(deployCalls).toEqual([]);
  });

  it("returns 422 when the latest tag does not contain the skill", async () => {
    const { app, registry, deployCalls } = makeApp({ skillAtTag: false });
    await registry.register(repo);

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

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

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "local-diverged-from-tag",
      message: expect.stringMatching(/tag/i),
    });
    expect(deployCalls).toEqual([]);
  });

  it("refuses a global deploy when the local skill diverges from the tag", async () => {
    // The content-drift guard is target-agnostic — global gets the same 409.
    const { app, deployCalls } = makeApp({ diverged: true });

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "local-diverged-from-tag",
      message: expect.stringMatching(/tag/i),
    });
    expect(deployCalls).toEqual([]);
  });

  it("returns 409 when the deployed copy has local edits vs the lockfile", async () => {
    // Destination guard: refuse rather than let a same-ref apm install silently
    // reset a locally-edited deployed subtree (apm-driver.md, #56).
    const { app, registry, deployCalls } = makeApp({ destDiverged: true });
    await registry.register(repo);

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "deployed-diverged-from-lock",
      message: expect.stringMatching(/never went through central/i),
    });
    expect(deployCalls).toEqual([]);
  });

  it("surfaces a distinct message for an unverifiable deployed copy", async () => {
    // diverged and unverifiable share the confirm-and-proceed action but carry
    // distinct messages: one knows there is drift, the other cannot tell. The
    // user must be able to tell the two apart (ADR-0006, #66).
    const { app, registry } = makeApp({ destUnverifiable: true });
    await registry.register(repo);

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "deployed-unverifiable",
      message: expect.stringMatching(/predates content tracking/i),
    });
  });

  it("force-deploys past a diverged deployed copy, reinstalling at the tag", async () => {
    // The confirmed reinstall: the route carries force through to the use-case,
    // which skips the destination guard and reinstalls at the latest tag (#66).
    const { app, registry, deployCalls } = makeApp({ destDiverged: true });
    await registry.register(repo);

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
      force: true,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
    expect(deployCalls).toHaveLength(1);
  });

  it("returns 409 when the deployed copy cannot be read", async () => {
    // The destination exists but cannot be walked/read; we cannot prove it safe
    // to overwrite. Surface a distinct refusal, not the generic deploy-failed
    // (502) that an apm execution error would produce (#59).
    const { app, registry, deployCalls } = makeApp({ destUnreadable: true });
    await registry.register(repo);

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "deployed-unreadable",
      message: expect.stringMatching(/read/i),
    });
    expect(deployCalls).toEqual([]);
  });

  it("returns 409 when the target lockfile cannot be parsed", async () => {
    // A present but malformed apm.lock.yaml leaves no trustworthy baseline, so
    // the guard refuses distinctly rather than letting a deploy proceed against
    // an unknown recorded state (#58).
    const { app, registry, deployCalls } = makeApp({
      destLockfileMalformed: true,
    });
    await registry.register(repo);

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "lockfile-malformed",
      message: expect.stringMatching(/lockfile/i),
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

    const first = post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });
    // Give the first request time to pass the lock before the second lands.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
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

  it("returns 409 for a concurrent global deploy", async () => {
    // Two clicks on "Global" race the same user-scope lockfile — the second is
    // refused, like the repo case (J07).
    let release: () => void = () => undefined;
    const holdApm = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { app, deployCalls } = makeApp({ holdApm });

    const first = post(app, {
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await post(app, {
      type: "skill",
      name: "tdd",
      target: globalTarget,
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

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({
      error: "deploy-failed",
      message: expect.stringMatching(/\S/),
    });
    // The raw apm error (which may carry a token) never reaches the client.
    expect(JSON.stringify(body)).not.toContain("token in stderr");
  });

  it("returns a sanitized 502 when a global apm install fails", async () => {
    const { app } = makeApp({ failApm: true });

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({
      error: "deploy-failed",
      message: expect.stringMatching(/\S/),
    });
    expect(JSON.stringify(body)).not.toContain("token in stderr");
  });

  it("surfaces missing GitHub auth as a distinct 502 with a re-auth message", async () => {
    // Auth failure is classified in the driver (at apm view) and mapped to a
    // 502 whose message names the fix — distinct from the generic deploy-failed
    // so the cockpit points at auth, not a vague apm error (#119).
    const { app, registry } = makeApp({ authRequired: true });
    await registry.register(repo);

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "auth-required",
      message:
        "GitHub authentication is missing or expired. Run 'gh auth login' (or set GITHUB_TOKEN) and try again.",
    });
  });
});
