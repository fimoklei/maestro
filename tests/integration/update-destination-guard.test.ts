// The update journey over the real destination guard and a real deployed
// subtree on disk, across every cell of the confirm-and-proceed matrix (#66, #952).
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CheckVersionDrift,
  DeployedContentAdapter,
  DeploySkill,
  DeployStateReader,
  InFlightLocks,
  type InventoryResult,
  LocalCopyGuard,
  NodeFileSystem,
} from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  rootPackageApm,
  rootPackageSelection,
} from "../helpers/root-package-apm";

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

  // One tag-pinned entry with the given deployed_file_hashes (apm 0.20.0 shape).
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
      `  - virtual_path: .apm/skills/${name}`,
      "    package_type: claude_skill",
      `    resolved_ref: ${tag}`,
      "    deployed_file_hashes:",
      ...lines,
      "",
    ].join("\n");
    await writeFile(join(root, "apm.lock.yaml"), yaml, "utf8");
  };

  // A pre-0.20.0 lockfile: no deployed_file_hashes, so no baseline to verify.
  const writeLegacyLockfile = async (name: string) => {
    const yaml = [
      "dependencies:",
      `  - virtual_path: .apm/skills/${name}`,
      "    package_type: claude_skill",
      "    resolved_ref: v0.4.0",
      "",
    ].join("\n");
    await writeFile(join(root, "apm.lock.yaml"), yaml, "utf8");
  };

  // Only apm is faked: a faithful install that resets the deployed copies and
  // rewrites the lockfile hashes, which lets an unverifiable copy heal.
  // `released` is null when the clone cannot answer.
  const makeDeploy = (released: Record<string, string> | null = null) => {
    const apm = rootPackageApm({ globalRoot: root });
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
    const deploy = new DeploySkill({
      inventory,
      registry: { isRegistered: async () => true },
      selection: rootPackageSelection({
        globalRoot: root,
        configPath: join(root, "maestro.json"),
        apm,
      }),
      recordedPackage: {
        read: async () => ({
          kind: "recorded" as const,
          reading: { kind: "skill" as const, name: "tdd" },
        }),
      },
      apm: {
        resolveLatestTag: async () => ({ ok: true, tag: LATEST_TAG }),
        deploySkill: apm.deploySkill,
      },
      inventoryGit: {
        syncBeforeDeploy: async () => {},
        skillExistsAtTag: async () => true,
        skillDivergesFromTag: async () => false,
        readSkillFilesAtTag: async () => released,
      },
      copyGuard: new LocalCopyGuard({
        content: new DeployedContentAdapter({
          location: {
            treeRoot: () => root,
            lockfilePath: () => join(root, "apm.lock.yaml"),
          },
          inventoryGit: { readSkillFilesAtTag: async () => released },
        }),
      }),
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
    return { deploy, installs: apm.installs };
  };

  const update = (deploy: DeploySkill, options?: { consent?: string }) =>
    deploy.execute({
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: root },
      ...(options?.consent === undefined
        ? {}
        : { confirmedCopyReceipt: options.consent }),
    });

  const consentFrom = async (deploy: DeploySkill) => {
    const refusal = await update(deploy);
    if (refusal.ok) {
      throw new Error("expected the guard to refuse");
    }
    return refusal.copyReceipt;
  };

  it("updates a clean deployed copy, the guard letting it proceed", async () => {
    const body = "---\nname: tdd\n---\nbody\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", body);
    await writeLockfile("tdd", { ".claude/skills/tdd/SKILL.md": sha(body) });

    const { deploy } = makeDeploy();

    expect(await update(deploy)).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: LATEST_TAG },
    });
  });

  // apm's comparison runs on the lockfile the update wrote, so the
  // post-update drift read proves something.
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

    expect(await update(makeDeploy().deploy)).toMatchObject({
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
    // A same-ref install would silently reset the edit, so the guard refuses (#56).
    const original = "---\nname: tdd\n---\noriginal\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", "edited locally\n");
    await writeLockfile("tdd", {
      ".claude/skills/tdd/SKILL.md": sha(original),
    });

    const { deploy } = makeDeploy();

    expect(await update(deploy)).toMatchObject({
      ok: false,
      error: "deployed-diverged-from-lock",
      copyReceipt: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("passes a copy that no longer matches its record but equals the release", async () => {
    // The copy on disk equals the release about to be installed: nothing is
    // at risk, so nothing is asked (#952).
    const original = "---\nname: tdd\n---\noriginal\n";
    const atRelease = "---\nname: tdd\n---\nreleased\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", atRelease);
    await writeDeployed(".agents/skills/tdd/SKILL.md", atRelease);
    await writeLockfile("tdd", {
      ".claude/skills/tdd/SKILL.md": sha(original),
      ".agents/skills/tdd/SKILL.md": sha(original),
    });

    const { deploy } = makeDeploy({ "SKILL.md": sha(atRelease) });

    expect(await update(deploy)).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: LATEST_TAG },
    });
  });

  it("keeps a copy protected when the release cannot be read", async () => {
    // Fail closed: no readable release means no proof of equality (#952).
    const original = "---\nname: tdd\n---\noriginal\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", "changed upstream\n");
    await writeLockfile("tdd", {
      ".claude/skills/tdd/SKILL.md": sha(original),
    });

    expect(await update(makeDeploy(null).deploy)).toMatchObject({
      ok: false,
      error: "deployed-diverged-from-lock",
    });
  });

  it("refuses a legacy lockfile without force, distinctly unverifiable", async () => {
    await writeDeployed(".claude/skills/tdd/SKILL.md", "deployed long ago\n");
    await writeLegacyLockfile("tdd");

    const { deploy } = makeDeploy();

    expect(await update(deploy)).toMatchObject({
      ok: false,
      error: "deployed-unverifiable",
      copyReceipt: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("reinstalls past an edited copy once its own receipt comes back", async () => {
    const original = "---\nname: tdd\n---\noriginal\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", "edited locally\n");
    await writeLockfile("tdd", {
      ".claude/skills/tdd/SKILL.md": sha(original),
    });

    const { deploy, installs } = makeDeploy();

    expect(
      await update(deploy, { consent: await consentFrom(deploy) }),
    ).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: LATEST_TAG },
    });
    expect(installs).toHaveLength(1);
  });

  it("refuses a receipt minted before the copy changed again", async () => {
    // The consent retires with the content it named; a fresh receipt follows (#952).
    const original = "---\nname: tdd\n---\noriginal\n";
    await writeLegacyLockfile("tdd");
    await writeDeployed(".claude/skills/tdd/SKILL.md", "deployed long ago\n");
    const { deploy } = makeDeploy();
    const stale = await consentFrom(deploy);

    await writeLockfile("tdd", {
      ".claude/skills/tdd/SKILL.md": sha(original),
    });

    expect(await update(deploy, { consent: stale })).toMatchObject({
      ok: false,
      error: "deployed-diverged-from-lock",
      copyReceipt: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("reinstalls past an unverified copy once its own receipt comes back", async () => {
    await writeDeployed(".claude/skills/tdd/SKILL.md", "deployed long ago\n");
    await writeLegacyLockfile("tdd");

    const { deploy } = makeDeploy();

    expect(
      await update(deploy, { consent: await consentFrom(deploy) }),
    ).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: LATEST_TAG },
    });
  });

  it("refuses an unreadable deployed copy, offering no receipt at all", async () => {
    // No consent is on offer: an overwrite of an unreadable copy is never
    // an informed choice (#59, #952).
    await writeDeployed(".claude/skills/tdd", "a file, not a directory\n");
    await writeLockfile("tdd", { ".claude/skills/tdd/SKILL.md": sha("x") });

    const { deploy, installs } = makeDeploy();

    expect(await update(deploy)).toEqual({
      ok: false,
      error: "deployed-unreadable",
    });
    expect(await update(deploy, { consent: "a".repeat(64) })).toEqual({
      ok: false,
      error: "deployed-unreadable",
    });
    expect(installs).toEqual([]);
  });

  it("self-heals an unverified copy: consent once, then it verifies clean", async () => {
    // The consented reinstall records the missing hashes, so the next update
    // verifies clean and proceeds unasked.
    await writeDeployed(".claude/skills/tdd/SKILL.md", "deployed long ago\n");
    await writeLegacyLockfile("tdd");

    const { deploy } = makeDeploy();

    const refusal = await update(deploy);
    expect(refusal).toMatchObject({
      ok: false,
      error: "deployed-unverifiable",
    });
    expect(
      await update(deploy, {
        consent: refusal.ok ? undefined : refusal.copyReceipt,
      }),
    ).toMatchObject({ ok: true });
    expect(await update(deploy)).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: LATEST_TAG },
    });
  });
});
