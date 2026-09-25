// The install that sets this up needs network and credentials, so the file
// runs only with MAESTRO_REAL_APM=1 (#336). Every removal names its package;
// never run a bare `apm uninstall -g`.
import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ApmCliDriver } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

const enabled = process.env.MAESTRO_REAL_APM === "1";

const HARNESS = "fimoklei/agent-harness";
// The old root `skills/` tree was dropped at v0.6.0; asking apm for it fails.
const SUBPATH = ".apm/skills";
const REMOVED = "tdd";
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

    for (const toolDir of [".claude", ".agents"]) {
      await expect(
        access(join(repo, toolDir, "skills", REMOVED)),
      ).rejects.toThrow();
      await expect(
        access(join(repo, toolDir, "skills", KEPT)),
      ).resolves.toBeUndefined();
    }

    // deploy-state reads this file: an entry left behind keeps the row on screen.
    const lock = await readFile(join(repo, "apm.lock.yaml"), "utf8");
    expect(lock).not.toContain(`virtual_path: ${SUBPATH}/${REMOVED}`);
    expect(lock).toContain(`virtual_path: ${SUBPATH}/${KEPT}`);
  });

  it("does not claim a removal for a package that was never installed", {
    timeout: 60_000,
  }, async () => {
    // The driver classifies on apm's markers, not its exit code.
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

// apm's user-scope install and uninstall both operate on Path.home(), so HOME
// points at a throwaway sandbox (#338).
describe.runIf(enabled)("real apm global uninstall canary", () => {
  let home: string;

  beforeEach(async () => {
    // A symlinked HOME makes apm ≥0.29.0 deploy nothing.
    home = await realpath(
      await mkdtemp(join(tmpdir(), "maestro-uninstall-global-home-")),
    );
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("removes one skill from every tool and from the global lockfile", {
    timeout: 180_000,
  }, async () => {
    const { stdout: tokenOut } = await run("gh", ["auth", "token"]);
    const token = tokenOut.trim();

    // apm appends apm_modules/ to the cwd's .gitignore even for -g, so the cwd
    // must never be a real repo.
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
        tools: ["claude", "codex"],
      });
      expect(installed).toEqual({ ok: true });
    }

    const removed = await driver.removeSkill({
      target: { kind: "global" },
      ref: refFor(REMOVED),
    });
    expect(removed).toEqual({ ok: true });

    // Assert the file, not the directory: apm can leave an empty directory behind.
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
