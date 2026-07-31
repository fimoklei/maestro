// The update journey driving the REAL destination guard against a real deployed
// subtree on disk — not the "clean" stub the J08 update journey and the
// server-deploy route both use. This wires DeployedContentAdapter into a real
// DeploySkill and runs execute() for every cell of the confirm-and-proceed
// matrix (ADR-0006, #66): a not-proven-clean copy refuses without force and
// reinstalls with it, while an unreadable copy refuses even with force (#59).
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CheckVersionDrift,
  DeployedContentAdapter,
  DeploySkill,
  DeployStateReader,
  type DeployTarget,
  InFlightLocks,
  type InventoryResult,
  NodeFileSystem,
} from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sha = (contents: Buffer | string) =>
  `sha256:${createHash("sha256").update(contents).digest("hex")}`;

const LATEST_TAG = "v0.5.1";

describe("update journey against the real destination guard", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "maestro-update-guard-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const writeDeployed = async (relPath: string, contents: Buffer | string) => {
    const abs = join(root, relPath);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, contents);
  };

  // One tag-pinned claude_skill entry carrying the given deployed_file_hashes
  // (path -> sha256), mirroring apm 0.20.0's lockfile shape.
  const writeLockfile = async (
    name: string,
    hashes: Record<string, string>,
    tag = LATEST_TAG,
  ) => {
    const lines = Object.entries(hashes).map(
      ([path, hash]) => `      ${path}: ${hash}`,
    );
    const yaml = [
      "dependencies:",
      `  - virtual_path: skills/${name}`,
      "    package_type: claude_skill",
      `    resolved_ref: ${tag}`,
      "    deployed_file_hashes:",
      ...lines,
      "",
    ].join("\n");
    await writeFile(join(root, "apm.lock.yaml"), yaml, "utf8");
  };

  // A pre-0.20.0 lockfile: the entry exists but records no deployed_file_hashes,
  // so the deployed copy cannot be verified against any baseline.
  const writeLegacyLockfile = async (name: string) => {
    const yaml = [
      "dependencies:",
      `  - virtual_path: skills/${name}`,
      "    package_type: claude_skill",
      "    resolved_ref: v0.4.0",
      "",
    ].join("\n");
    await writeFile(join(root, "apm.lock.yaml"), yaml, "utf8");
  };

  // A real DeploySkill with the real destination guard wired in. Only the apm
  // boundary is faked; classify runs against the live subtree under `root`.
  // The fake takes the install's side effect on disk; the driver's own success
  // result is added here, so a test only describes what apm would write.
  const makeDeploy = (
    install: (input: {
      target: DeployTarget;
      ref: string;
    }) => Promise<void> = async () => undefined,
  ) => {
    const inventory: { read(): Promise<InventoryResult> } = {
      read: async () => ({
        ok: true,
        primitives: [
          {
            type: "skill",
            name: "tdd",
            description: "Test-driven development",
          },
        ],
      }),
    };
    return new DeploySkill({
      inventory,
      registry: { isRegistered: async () => true },
      apm: {
        resolveLatestTag: async () => ({ ok: true, tag: LATEST_TAG }),
        deploySkill: async (input) => {
          await install(input);
          return { ok: true };
        },
      },
      inventoryGit: {
        skillExistsAtTag: async () => true,
        skillDivergesFromTag: async () => false,
      },
      deployedContent: new DeployedContentAdapter({
        location: {
          treeRoot: () => root,
          lockfilePath: () => join(root, "apm.lock.yaml"),
        },
      }),
      deployedCleanup: { removeSkillTargets: async () => undefined },
      toolPresence: { detectGlobalTools: async () => ["claude", "codex"] },
      inventoryOriginUrl: async () =>
        "git@github.com:fimoklei/agent-harness.git",
      canonicalPath: async (path) => path,
      locks: new InFlightLocks(),
    });
  };

  const update = (deploy: DeploySkill, options?: { force?: boolean }) =>
    deploy.execute({
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: root },
      force: options?.force,
    });

  // A faithful apm reinstall: a same-ref install resets both deployed copies to
  // the tag's content and rewrites the lockfile with their fresh per-file hashes
  // (apm 0.20.0, apm-driver.md). After it runs the destination verifies clean —
  // the basis for self-healing an unverifiable copy.
  const TAG_BODY = "---\nname: tdd\n---\nfresh from the tag\n";
  const reinstallAtTag = async () => {
    await writeDeployed(".claude/skills/tdd/SKILL.md", TAG_BODY);
    await writeDeployed(".agents/skills/tdd/SKILL.md", TAG_BODY);
    await writeLockfile("tdd", {
      ".claude/skills/tdd/SKILL.md": sha(TAG_BODY),
      ".agents/skills/tdd/SKILL.md": sha(TAG_BODY),
    });
  };

  it("updates a clean deployed copy, the guard letting it proceed", async () => {
    const body = "---\nname: tdd\n---\nbody\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", body);
    await writeLockfile("tdd", { ".claude/skills/tdd/SKILL.md": sha(body) });

    const deploy = makeDeploy();

    expect(await update(deploy)).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: LATEST_TAG },
    });
  });

  // apm's own comparison, standing on the lockfile the update wrote: anything
  // still pinned below the latest tag is behind. Faking the comparison but not
  // its input is what makes the post-update drift read prove something.
  const driftFromLockfile = () =>
    new CheckVersionDrift({
      registry: { isRegistered: async () => true },
      apm: {
        checkOutdated: async () => {
          const state = await new DeployStateReader({
            fs: new NodeFileSystem(),
          }).read(root);
          if (!state.ok) {
            return { ok: false as const };
          }
          return {
            ok: true as const,
            behind: state.primitives
              .filter((primitive) => primitive.version !== LATEST_TAG)
              .map((primitive) => ({
                name: primitive.name,
                current: primitive.version,
                latest: LATEST_TAG,
              })),
          };
        },
      },
      canonicalPath: async (path) => path,
    });

  it("leaves the deploy-state reading the new tag, and drift reporting nothing behind", async () => {
    // The J08 journey's tail: an update is a re-deploy at the latest tag, so
    // both the state a user reads and the drift check derived from it have to
    // move with the tag apm actually wrote.
    const body = "---\nname: tdd\n---\nbody\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", body);
    await writeLockfile(
      "tdd",
      { ".claude/skills/tdd/SKILL.md": sha(body) },
      "v0.5.0",
    );
    const reader = new DeployStateReader({ fs: new NodeFileSystem() });
    const drift = driftFromLockfile();

    expect(await reader.read(root)).toMatchObject({
      primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
    });
    expect(
      await drift.execute({ target: { kind: "repo", repoPath: root } }),
    ).toEqual({
      ok: true,
      behind: [{ name: "tdd", current: "v0.5.0", latest: LATEST_TAG }],
    });

    expect(await update(makeDeploy(reinstallAtTag))).toMatchObject({
      ok: true,
    });

    expect(await reader.read(root)).toMatchObject({
      primitives: [{ type: "skill", name: "tdd", version: LATEST_TAG }],
    });
    expect(
      await drift.execute({ target: { kind: "repo", repoPath: root } }),
    ).toEqual({
      ok: true,
      behind: [],
    });
  });

  it("refuses an edited deployed copy without force, distinctly diverged", async () => {
    // The deployed SKILL.md was edited after install, so its live hash no longer
    // matches the lockfile baseline. Without a confirmed reinstall the guard
    // refuses, since a same-ref install would silently reset the edit (#56).
    const original = "---\nname: tdd\n---\noriginal\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", "edited locally\n");
    await writeLockfile("tdd", {
      ".claude/skills/tdd/SKILL.md": sha(original),
    });

    const deploy = makeDeploy();

    expect(await update(deploy)).toEqual({
      ok: false,
      error: "deployed-diverged-from-lock",
    });
  });

  it("refuses a legacy lockfile without force, distinctly unverifiable", async () => {
    // A deployed copy sits on disk but the pre-0.20.0 lockfile records no hashes,
    // so the guard cannot prove it clean. A distinct refusal from diverged: the
    // user reconciles before any reinstall (#56).
    await writeDeployed(".claude/skills/tdd/SKILL.md", "deployed long ago\n");
    await writeLegacyLockfile("tdd");

    const deploy = makeDeploy();

    expect(await update(deploy)).toEqual({
      ok: false,
      error: "deployed-unverifiable",
    });
  });

  it("force-reinstalls past an edited deployed copy at the latest tag", async () => {
    // A confirmed reinstall overrides the diverged refusal: the destination guard
    // is skipped and apm reinstalls at the latest tag, discarding the edit
    // (ADR-0006). Every other guard still ran to get here.
    const original = "---\nname: tdd\n---\noriginal\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", "edited locally\n");
    await writeLockfile("tdd", {
      ".claude/skills/tdd/SKILL.md": sha(original),
    });

    let reinstalled = false;
    const deploy = makeDeploy(async () => {
      reinstalled = true;
      await reinstallAtTag();
    });

    expect(await update(deploy, { force: true })).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: LATEST_TAG },
    });
    expect(reinstalled).toBe(true);
  });

  it("force-reinstalls past an unverifiable deployed copy at the latest tag", async () => {
    // The other force-overridable state: a legacy copy with no recorded hashes.
    // A confirmed reinstall proceeds and re-pins it at the latest tag.
    await writeDeployed(".claude/skills/tdd/SKILL.md", "deployed long ago\n");
    await writeLegacyLockfile("tdd");

    const deploy = makeDeploy(reinstallAtTag);

    expect(await update(deploy, { force: true })).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: LATEST_TAG },
    });
  });

  it("refuses an unreadable deployed copy even with force", async () => {
    // A regular file sits where .claude/skills/tdd should be a directory, so the
    // copy cannot be read. force is not an override here: a blind overwrite of
    // something we cannot inspect is never an informed choice (#59).
    await writeDeployed(".claude/skills/tdd", "a file, not a directory\n");
    await writeLockfile("tdd", { ".claude/skills/tdd/SKILL.md": sha("x") });

    let reinstalled = false;
    const deploy = makeDeploy(async () => {
      reinstalled = true;
    });

    expect(await update(deploy, { force: true })).toEqual({
      ok: false,
      error: "deployed-unreadable",
    });
    expect(reinstalled).toBe(false);
  });

  it("self-heals an unverifiable copy: force once, then it verifies clean", async () => {
    // ADR-0006, no bulk update-all: a forced reinstall records deployed_file_hashes
    // the legacy copy lacked, so the very next update verifies clean and proceeds
    // without force — the unverifiable state does not persist.
    await writeDeployed(".claude/skills/tdd/SKILL.md", "deployed long ago\n");
    await writeLegacyLockfile("tdd");

    const deploy = makeDeploy(reinstallAtTag);

    // Before: a plain update refuses, the copy cannot be verified.
    expect(await update(deploy)).toEqual({
      ok: false,
      error: "deployed-unverifiable",
    });
    // The confirmed reinstall heals it.
    expect(await update(deploy, { force: true })).toMatchObject({ ok: true });
    // After: a plain update now proceeds — the copy verifies clean on its own.
    expect(await update(deploy)).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: LATEST_TAG },
    });
  });
});
