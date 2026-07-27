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
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ApmCliDriver } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

const enabled = process.env.MAESTRO_REAL_APM === "1";

const HARNESS = "fimoklei/agent-harness";
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
      `github.com/${HARNESS}/skills/${skill}#${tag}`;

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
    expect(lock).not.toContain(`virtual_path: skills/${REMOVED}`);
    expect(lock).toContain(`virtual_path: skills/${KEPT}`);
  });

  it("does not claim a removal for a package that was never installed", {
    timeout: 60_000,
  }, async () => {
    // Every uninstall outcome exits 0, so a package apm never had must still
    // come back as a failure rather than a clean removal.
    const driver = new ApmCliDriver({
      run: (file, args, options) =>
        run(file, args, { ...options, env: { ...process.env, HOME: home } }),
    });

    const removed = await driver.removeSkill({
      target: { kind: "repo", repoPath: repo },
      ref: `github.com/${HARNESS}/skills/${REMOVED}#v0.5.1`,
    });

    expect(removed).toEqual({ ok: false });
  });
});

describe.runIf(!enabled)("real apm uninstall canary (skipped)", () => {
  it("is disabled without MAESTRO_REAL_APM=1", () => {
    expect(enabled).toBe(false);
  });
});
