import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ApmCliDriver,
  DeployedContentAdapter,
  DeploySkill,
  type DeployTarget,
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
  RecordedPackageAdapter,
  type SupportedTool,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { makeRepoDir } from "../helpers/repo-dir";
import {
  rootPackageApm,
  rootPackageSelection,
} from "../helpers/root-package-apm";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubRetryOperation } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubFolderChooser } from "../helpers/stub-folder-chooser";
import { stubHarness } from "../helpers/stub-harness";
import { stubImport } from "../helpers/stub-import";
import { stubPromotes } from "../helpers/stub-promote";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubScaffold } from "../helpers/stub-scaffold";
import { stubUpdate } from "../helpers/stub-update";

// Integration lane: the deploy route over the real Hono app, real temp dirs,
// real inventory files. Only the ApmDriver is faked — its deploySkill writes
// the root package's manifest, lockfile and deployed copies into the target
// (repo or global root), so a deploy is proven from disk (ADR-0031, #951).
// Origin/Host guard enforcement lives in server-security.test.ts.

// The one ref every install names: the Harness root at the resolved release.
const HARNESS_REF = "github.com/fimoklei/agent-harness#v0.5.1";
describe("deploy HTTP route", () => {
  let home: string;
  let harness: string;
  let repo: string;
  let globalRoot: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-deploy-home-"));
    harness = await mkdtemp(join(tmpdir(), "maestro-harness-"));
    repo = await makeRepoDir("maestro-target-");
    globalRoot = await mkdtemp(join(tmpdir(), "maestro-global-"));
    await mkdir(join(harness, ".apm", "skills", "tdd"), { recursive: true });
    await writeFile(
      join(harness, ".apm", "skills", "tdd", "SKILL.md"),
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

  const capturedLockfile = (ref: string, packageType = "claude_skill") =>
    [
      "lockfile_version: '1'",
      "apm_version: 0.16.0",
      "dependencies:",
      "- repo_url: fimoklei/agent-harness",
      "  host: github.com",
      "  resolved_commit: 471c4b26471c4b26471c4b26471c4b26471c4b26",
      `  resolved_ref: ${ref}`,
      "  virtual_path: .apm/skills/tdd",
      "  is_virtual: true",
      `  package_type: ${packageType}`,
      "  deployed_files:",
      "  - .claude/skills/tdd",
      "  content_hash: sha256:abc",
      "",
    ].join("\n");

  function makeApp(options?: {
    failApm?: boolean;
    authRequired?: boolean;
    // apm refused the install because the destination skill dir is a symlink,
    // classified by the driver from apm's fixed phrase (#180).
    symlinkRefused?: boolean;
    skillAtTag?: boolean;
    diverged?: boolean;
    destDiverged?: boolean;
    destUnverifiable?: boolean;
    destUnreadable?: boolean;
    destLockfileMalformed?: boolean;
    holdApm?: Promise<void>;
    // Which tools a global deploy detects on the machine (ADR-0011). Defaults to
    // both; an empty list drives the no-supported-tool refusal (#131).
    globalTools?: SupportedTool[];
    // What the install actually leaves on disk, whatever it was asked for: the
    // half-landed install a Selection write is proven against (#951).
    lands?: (skills: readonly string[]) => readonly string[];
  }) {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => harness,
      // Inventory answers from the latest release, so the skill is declared
      // released here rather than inferred from the harness on disk (#841).
      readReleasedSkills: async () => [
        {
          name: "tdd",
          manifest:
            "---\nname: tdd\ndescription: Test-driven development\n---\n",
        },
      ],
    });
    const deployState = stubDeployState({ fs });
    const cleanupCalls: Array<{
      target: DeployTarget;
      name: string;
      tools: readonly SupportedTool[];
    }> = [];
    const locks = new InFlightLocks();
    // Writes the root package the way apm does: the manifest, the lockfile and
    // the deployed copies, under the repo or the user-scope root.
    const landing = rootPackageApm({
      globalRoot,
      ...(options?.lands === undefined ? {} : { lands: options.lands }),
    });
    const apm = {
      ...landing,
      deploySkill: async (input: Parameters<typeof landing.deploySkill>[0]) => {
        if (options?.failApm) {
          throw new Error("apm install failed: token in stderr");
        }
        if (options?.symlinkRefused) {
          // The real driver, fed apm's real refusal output (captured fixture,
          // with a token-bearing URL appended). Classification and the
          // no-leak guarantee are then exercised end to end, not stubbed.
          return await new ApmCliDriver({
            run: async () => {
              throw Object.assign(new Error("Command failed: apm install"), {
                code: 1,
                stdout: `${await readFile(
                  "tests/fixtures/apm-install-symlink-refused.txt",
                  "utf8",
                )}\nhttps://x-access-token:ghp_secret@github.com`,
                stderr: "",
              });
            },
          }).deploySkill(input);
        }
        if (options?.holdApm) {
          await options.holdApm;
        }
        return await landing.deploySkill(input);
      },
    };
    const selection = rootPackageSelection({
      globalRoot,
      configPath: join(home, "config.json"),
      apm,
    });
    const deploy = new DeploySkill({
      inventory,
      registry,
      locks,
      selection,
      apm: {
        resolveLatestTag: async () =>
          options?.authRequired
            ? { ok: false, reason: "auth-required" }
            : { ok: true, tag: "v0.5.1" },
        deploySkill: apm.deploySkill,
      },
      inventoryGit: {
        syncBeforeDeploy: async () => {},
        skillExistsAtTag: async () => options?.skillAtTag ?? true,
        skillDivergesFromTag: async () => options?.diverged ?? false,
        readSkillFilesAtTag: async () => null,
      },
      deployedContent: {
        contentDigest: async () => null,
        classify: async () => {
          if (options?.destLockfileMalformed) return "lockfile-malformed";
          if (options?.destUnreadable) return "unreadable";
          if (options?.destUnverifiable) return "unverifiable";
          return options?.destDiverged ? "diverged" : "not-deployed";
        },
        // Real, over this run's temp roots: the path the notice spells out is
        // read off disk, so the route can never forward a guessed one (#748).
        linkedSkillPath: (input) =>
          new DeployedContentAdapter({
            location: {
              treeRoot: (target) =>
                target.kind === "repo" ? target.repoPath : globalRoot,
              lockfilePath: () => join(globalRoot, "apm.lock.yaml"),
            },
          }).linkedSkillPath(input),
      },
      deployedCleanup: {
        removeSkillTargets: async (input) => {
          cleanupCalls.push(input);
        },
      },
      toolPresence: {
        detectGlobalTools: async () =>
          options?.globalTools ?? ["claude", "codex"],
      },
      recordedPackage: new RecordedPackageAdapter({
        fs,
        // Mirrors DeployedLocation, aimed at this run's temp roots: the fake
        // apm writes its lockfile where the real one would.
        location: {
          lockfilePath: (target) =>
            join(
              target.kind === "repo" ? target.repoPath : globalRoot,
              "apm.lock.yaml",
            ),
        },
      }),
      canonicalPath: (path) => fs.realpath(path),
      inventoryOriginUrl: async () =>
        "git@github.com:fimoklei/agent-harness.git",
    });
    const app = createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      deployState,
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
      browse: stubBrowse(),
      folderChooser: stubFolderChooser(),
      update: stubUpdate(),
      enforceOriginHost: false,
    });
    return {
      app,
      registry,
      selection,
      installs: landing.installs,
      cleanupCalls,
    };
  }

  const post = (app: ReturnType<typeof makeApp>["app"], body: unknown) =>
    app.request("/api/deploy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("deploys a skill into a registered repo at the latest tag", async () => {
    const { app, registry, installs } = makeApp();
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
    expect(installs).toEqual([
      { target: repoTarget(repo), ref: HARNESS_REF, skills: ["tdd"] },
    ]);
    // The deploy-state read now sees the skill at its tag — the see-back half.
    expect(await readFile(join(repo, "apm.lock.yaml"), "utf8")).toContain(
      "v0.5.1",
    );
  });

  it("reports an install that landed nothing as incomplete, never a success", async () => {
    // apm returned success and placed none of the Selection. A deploy is what
    // is on disk, so the route answers the incomplete write (ADR-0031, #951).
    const { app, registry } = makeApp({ lands: () => [] });
    await registry.register(repo);

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "deploy-incomplete" });
  });

  it("deploys a corrected release over an unsupported result, unforced", async () => {
    // The state an unsupported deploy leaves: hybrid files on disk with no
    // baseline of their own, which the destination guard calls unverifiable.
    // They are apm's, not local work, so the corrected release goes through
    // without a forced overwrite (#358).
    const { app, registry } = makeApp({ destUnverifiable: true });
    await registry.register(repo);
    await writeFile(
      join(repo, "apm.lock.yaml"),
      capturedLockfile("v0.5.0", "hybrid"),
      "utf8",
    );

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
  });

  it("leaves the unfinished operation standing after an incomplete install", async () => {
    // The record is what Retry deploy converges on, so it survives the write
    // that never finished rather than being tidied away (#951).
    const { app, registry, selection } = makeApp({ lands: () => [] });
    await registry.register(repo);

    await post(app, { type: "skill", name: "tdd", target: repoTarget(repo) });

    expect(await selection.pending(await realpath(repo))).toMatchObject({
      kind: "deploy",
      release: "v0.5.1",
      desired: ["tdd"],
    });
  });

  it("deploys a skill globally, with no repo registered", async () => {
    // Global crosses no client path, so it needs no registry entry: the deploy
    // succeeds against zero registered repos (J07).
    const { app, installs } = makeApp();

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
    expect(installs).toEqual([
      {
        target: globalTarget,
        ref: HARNESS_REF,
        skills: ["tdd"],
        // Both tools present on this machine, so both are targeted (ADR-0011).
        tools: ["claude", "codex"],
      },
    ]);
    expect(await readFile(join(globalRoot, "apm.lock.yaml"), "utf8")).toContain(
      "v0.5.1",
    );
  });

  it("targets only the detected tool for a single-tool machine", async () => {
    // ADR-0011: a Claude-only machine gets -t claude, never a dead .agents/
    // tree. The route passes the detected subset through to the driver (#131).
    const { app, installs, cleanupCalls } = makeApp({
      globalTools: ["claude"],
    });

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(res.status).toBe(200);
    expect(installs).toEqual([
      {
        target: globalTarget,
        ref: HARNESS_REF,
        skills: ["tdd"],
        tools: ["claude"],
      },
    ]);
    // The untargeted codex copy sits in the shared .agents/skills/, which other
    // tools read, so nothing is reconciled away (#202).
    expect(cleanupCalls).toEqual([]);
  });

  it("reconciles away the untargeted tool's exclusive copy", async () => {
    // Claude Code alone reads .claude/skills/, so narrowing to codex leaves
    // that copy provably dead and the route removes it (#136, #202).
    const { app, cleanupCalls } = makeApp({ globalTools: ["codex"] });

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(res.status).toBe(200);
    expect(cleanupCalls).toEqual([
      { target: globalTarget, name: "tdd", tools: ["claude"] },
    ]);
  });

  it("cleans no obsolete copy when both tools are present", async () => {
    // A full two-tool machine narrows nothing away, so the cleanup step is
    // skipped entirely (#136).
    const { app, cleanupCalls } = makeApp({ globalTools: ["claude", "codex"] });

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(res.status).toBe(200);
    expect(cleanupCalls).toEqual([]);
  });

  it("refuses a global deploy when no supported tool is detected", async () => {
    // No Claude, no Codex → 409 with its own code and no apm invocation
    // (ADR-0011, #131).
    const { app, installs } = makeApp({ globalTools: [] });

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "no-supported-tool",
    });
    expect(installs).toEqual([]);
  });

  it("refuses to deploy into a repo that is not registered", async () => {
    const { app, installs } = makeApp();

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(403);
    expect(installs).toEqual([]);
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

  it("returns 422 with its own code for a non-skill type", async () => {
    const { app, registry, installs } = makeApp();
    await registry.register(repo);

    const res = await post(app, {
      type: "hook",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "unsupported-primitive-type",
    });
    expect(installs).toEqual([]);
  });

  // Pins ADR-0025 §8 at the wire: a refusal is a code and a status, and the
  // sentence for it lives in `packages/web`. Asserted by absence, not by a
  // whole-body match that would pass for the wrong reason.
  it("answers a refusal with a code and a status, and no sentence", async () => {
    const { app, registry } = makeApp();
    await registry.register(repo);

    const res = await post(app, {
      type: "hook",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("unsupported-primitive-type");
    expect(Object.hasOwn(body, "message")).toBe(false);
  });

  it("returns 400 for an invalid body", async () => {
    const { app } = makeApp();

    const res = await post(app, { name: "tdd" });

    expect(res.status).toBe(400);
  });

  it("returns 400 for a name that is not a strict slug", async () => {
    const { app, registry, installs } = makeApp();
    await registry.register(repo);

    const res = await post(app, {
      type: "skill",
      name: "../escape",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(400);
    expect(installs).toEqual([]);
  });

  it("returns 422 when the latest tag does not contain the skill", async () => {
    const { app, registry, installs } = makeApp({ skillAtTag: false });
    await registry.register(repo);

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "no-published-tag",
    });
    expect(installs).toEqual([]);
  });

  it("returns 409 when the local skill diverges from the latest tag", async () => {
    const { app, registry, installs } = makeApp({ diverged: true });
    await registry.register(repo);

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("local-diverged-from-tag");
    // The sentence — and the voice rule it carries — now lives in
    // `deploy-state/notice-copy.ts`, asserted in its sibling test (#684).
    expect(installs).toEqual([]);
  });

  it("refuses a global deploy when the local skill diverges from the tag", async () => {
    // The content-drift guard is target-agnostic — global gets the same 409.
    const { app, installs } = makeApp({ diverged: true });

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "local-diverged-from-tag",
    });
    expect(installs).toEqual([]);
  });

  it("returns 409 when the deployed copy has local edits vs the lockfile", async () => {
    // Destination guard: refuse rather than let a same-ref apm install silently
    // reset a locally-edited deployed subtree (apm-driver.md, #56).
    const { app, registry, installs } = makeApp({ destDiverged: true });
    await registry.register(repo);

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(409);
    // The refusal carries the consent its own reading minted, so the reader's
    // next attempt licenses exactly these copies (#952).
    expect(await res.json()).toEqual({
      error: "deployed-diverged-from-lock",
      copyReceipt: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(installs).toEqual([]);
  });

  it("surfaces a distinct code for an unverifiable deployed copy", async () => {
    // diverged and unverifiable share the confirm-and-proceed action but carry
    // distinct codes: one knows there is drift, the other cannot tell. The
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
      copyReceipt: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("deploys past a diverged copy on the receipt its refusal minted", async () => {
    // The whole journey over the wire: the route answers a refusal with the
    // consent, and carries that consent back to the use-case, which reinstalls
    // at the latest tag (#66, #952).
    const { app, registry, installs } = makeApp({ destDiverged: true });
    await registry.register(repo);

    const refused = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });
    const { copyReceipt } = (await refused.json()) as { copyReceipt: string };

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
      confirmedCopyReceipt: copyReceipt,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
    expect(installs).toHaveLength(1);
  });

  it("returns 409 when the deployed copy cannot be read", async () => {
    // The destination exists but cannot be walked/read; we cannot prove it safe
    // to overwrite. Surface a distinct refusal, not the generic deploy-failed
    // (502) that an apm execution error would produce (#59).
    const { app, registry, installs } = makeApp({ destUnreadable: true });
    await registry.register(repo);

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "deployed-unreadable",
    });
    expect(installs).toEqual([]);
  });

  it("returns 409 when the target lockfile cannot be parsed", async () => {
    // A present but malformed apm.lock.yaml leaves no trustworthy baseline, so
    // the guard refuses distinctly rather than letting a deploy proceed against
    // an unknown recorded state (#58).
    const { app, registry, installs } = makeApp({
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
    });
    expect(installs).toEqual([]);
  });

  it("returns 409 for a concurrent deploy to the same repo", async () => {
    let release: () => void = () => undefined;
    const holdApm = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { app, registry, installs } = makeApp({ holdApm });
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
    });

    release();
    expect((await first).status).toBe(200);
    expect(installs).toHaveLength(1);
  });

  it("returns 409 for a concurrent global deploy", async () => {
    // Two clicks on "Global" race the same user-scope lockfile — the second is
    // refused, like the repo case (J07).
    let release: () => void = () => undefined;
    const holdApm = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { app, installs } = makeApp({ holdApm });

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
    });

    release();
    expect((await first).status).toBe(200);
    expect(installs).toHaveLength(1);
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
    });
    expect(JSON.stringify(body)).not.toContain("token in stderr");
  });

  it("surfaces missing GitHub auth as a distinct 502", async () => {
    // Auth failure is classified in the driver (at apm view) and mapped to its
    // own 502 code — distinct from the generic deploy-failed so the cockpit
    // points at auth, not a vague apm error (#119).
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
    });
  });

  it("surfaces a symlinked destination as its own status", async () => {
    // apm refuses to deploy into a skill directory that is a symlink. The
    // cockpit names that case from its own code; the sentence that points at
    // the supported pattern lives in `deploy-state/notice-copy.ts` (#180).
    const { app, registry } = makeApp({ symlinkRefused: true });
    await registry.register(repo);
    await mkdir(join(repo, ".claude/skills"), { recursive: true });
    await symlink(
      join(harness, ".apm/skills/tdd"),
      join(repo, ".claude/skills/tdd"),
    );

    const res = await post(app, {
      type: "skill",
      name: "tdd",
      target: repoTarget(repo),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; linkedPath?: string };
    expect(body.error).toBe("destination-symlinked");
    // The path is Maestro's own, recomputed from the deploy's subtrees, so the
    // notice can spell out one `rm` without forwarding apm's prose (#748).
    expect(body.linkedPath).toBe(join(repo, ".claude/skills/tdd"));
    // No raw apm output reaches the client; the reply is a code and a status.
    expect(JSON.stringify(body)).not.toContain("ghp_secret");
    expect(JSON.stringify(body)).not.toContain("refusing to deploy");
  });
});
