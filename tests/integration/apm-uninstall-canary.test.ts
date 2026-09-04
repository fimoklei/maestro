// The real per-repo uninstall canary (issue #336): proves the genuine
// `apm uninstall <ref>` round-trip the automated suite otherwise only exercises
// against captured output. When enabled it installs two skills into a throwaway
// sandbox repo, removes one through the driver, and asserts what only real apm
// can prove: the removed skill's deployed files and its lockfile entry are gone,
// while the unrelated skill survives untouched.
//
// The uninstall half needs neither network nor credentials (apm-behavior.md
// § Remove); the install that sets it up does, so the whole file sits behind
// MAESTRO_REAL_APM=1 with the other canaries and stays out of the fast loop.
//
// Safety: the repo is a temp directory and HOME is redirected to a sandbox for
// every apm subprocess, so no real project or home is touched, and the removal
// always names its package — a bare `apm uninstall -g` is never run
// (.claude/rules/apm-driver.md § Danger).
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ApmCliDriver } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

const enabled = process.env.MAESTRO_REAL_APM === "1";

const HARNESS = "fimoklei/agent-harness";
// The canonical skill subpath (ADR-0021); the harness dropped its old root
// `skills/` tree at v0.6.0, so asking apm for that fails validation.
const SUBPATH = ".apm/skills";
const REMOVED = "tdd";
// A second skill that exists in the harness alongside tdd, so the canary can
// prove a removal is scoped to its own package.
const KEPT = "prototype";

describe.runIf(enabled)("real apm uninstall canary", () => {
  let home: string;
  let repo: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-uninstall-home-"));
    repo = await mkdtemp(join(tmpdir(), "maestro-uninstall-repo-"));
  });

  afterEach(async () => {
    for (const dir of [home, repo]) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("removes one skill's files and lockfile entry, leaving the others", {
    timeout: 180_000,
  }, async () => {
    // gh's keyring is HOME-independent, so the token survives the redirect.
    const { stdout: tokenOut } = await run("gh", ["auth", "token"]);
    const token = tokenOut.trim();

    const driver = new ApmCliDriver({
      run: (file, args, options) =>
        run(file, args, {
          ...options,
          env: { ...process.env, HOME: home, GITHUB_TOKEN: token },
        }),
    });

    const resolved = await driver.resolveLatestTag(HARNESS);
    if (!resolved.ok) {
      throw new Error(`expected a resolved tag, got ${resolved.reason}`);
    }
    const tag = resolved.tag;
    const refFor = (skill: string) =>
      `github.com/${HARNESS}/${SUBPATH}/${skill}#${tag}`;

    for (const skill of [REMOVED, KEPT]) {
      const installed = await driver.deploySkill({
        target: { kind: "repo", repoPath: repo },
        ref: refFor(skill),
      });
      expect(installed).toEqual({ ok: true });
    }

    const removed = await driver.removeSkill({
      target: { kind: "repo", repoPath: repo },
      ref: refFor(REMOVED),
    });
    expect(removed).toEqual({ ok: true });

    // The deployed copy is gone from every tool directory the install wrote.
    for (const toolDir of [".claude", ".agents"]) {
      await expect(
        access(join(repo, toolDir, "skills", REMOVED)),
      ).rejects.toThrow();
      await expect(
        access(join(repo, toolDir, "skills", KEPT)),
      ).resolves.toBeUndefined();
    }

    // And so is its lockfile bookkeeping — deploy-state reads that file, so an
    // entry left behind would keep the row on screen for a skill that is no
    // longer there.
    const lock = await readFile(join(repo, "apm.lock.yaml"), "utf8");
    expect(lock).not.toContain(`virtual_path: ${SUBPATH}/${REMOVED}`);
    expect(lock).toContain(`virtual_path: ${SUBPATH}/${KEPT}`);
  });

  it("does not claim a removal for a package that was never installed", {
    timeout: 60_000,
  }, async () => {
    // The driver classifies on apm's markers, not its exit code, so a package
    // apm never had must come back as a failure rather than a clean removal.
    const driver = new ApmCliDriver({
      run: (file, args, options) =>
        run(file, args, { ...options, env: { ...process.env, HOME: home } }),
    });

    const removed = await driver.removeSkill({
      target: { kind: "repo", repoPath: repo },
      ref: `github.com/${HARNESS}/${SUBPATH}/${REMOVED}#v0.6.0`,
    });

    expect(removed).toEqual({ ok: false });
  });
});

// The global half of the same canary (issue #338). apm's user-scope install and
// uninstall both operate on Path.home(), so HOME is redirected at a throwaway
// sandbox for every subprocess and the removal always names its package — a bare
// `apm uninstall -g` is never run (.claude/rules/apm-driver.md § Danger). What
// only real apm can prove: the removed skill's copies are gone from every tool
// directory it wrote and from ~/.apm's lockfile, while the unrelated skill
// survives in both.
describe.runIf(enabled)("real apm global uninstall canary", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-uninstall-global-home-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("removes one skill from every tool and from the global lockfile", {
    timeout: 180_000,
  }, async () => {
    const { stdout: tokenOut } = await run("gh", ["auth", "token"]);
    const token = tokenOut.trim();

    // The scratch cwd lives under the sandbox too: apm appends apm_modules/ to
    // the cwd's .gitignore even for -g, so it must never be a real repo
    // (apm-driver.md).
    const scratchCwd = join(home, ".apm-scratch");
    const driver = new ApmCliDriver({
      run: (file, args, options) =>
        run(file, args, {
          ...options,
          env: { ...process.env, HOME: home, GITHUB_TOKEN: token },
        }),
      prepareGlobalCwd: async () => {
        await mkdir(scratchCwd, { recursive: true });
        return scratchCwd;
      },
    });

    const resolved = await driver.resolveLatestTag(HARNESS);
    if (!resolved.ok) {
      throw new Error(`expected a resolved tag, got ${resolved.reason}`);
    }
    const refFor = (skill: string) =>
      `github.com/${HARNESS}/${SUBPATH}/${skill}#${resolved.tag}`;

    for (const skill of [REMOVED, KEPT]) {
      const installed = await driver.deploySkill({
        target: { kind: "global" },
        ref: refFor(skill),
        // Both tools, so the removal has more than one copy to account for.
        tools: ["claude", "codex"],
      });
      expect(installed).toEqual({ ok: true });
    }

    const removed = await driver.removeSkill({
      target: { kind: "global" },
      ref: refFor(REMOVED),
    });
    expect(removed).toEqual({ ok: true });

    // One action, every tool: the copy is gone under both directories apm
    // deployed to, and the unrelated skill still holds its file — asserting the
    // file, not the directory, because apm can leave an empty directory behind.
    for (const toolDir of [".claude", ".agents"]) {
      await expect(
        access(join(home, toolDir, "skills", REMOVED)),
      ).rejects.toThrow();
      await expect(
        access(join(home, toolDir, "skills", KEPT, "SKILL.md")),
      ).resolves.toBeUndefined();
    }

    const lock = await readFile(join(home, ".apm", "apm.lock.yaml"), "utf8");
    expect(lock).not.toContain(`virtual_path: ${SUBPATH}/${REMOVED}`);
    expect(lock).toContain(`virtual_path: ${SUBPATH}/${KEPT}`);
  });
});

describe.runIf(!enabled)("real apm uninstall canary (skipped)", () => {
  it("is disabled without MAESTRO_REAL_APM=1", () => {
    expect(enabled).toBe(false);
  });
});
