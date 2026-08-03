// The real-apm outdated canary (issue #46 / apm-driver.md): proves the driver's
// checkOutdated and the outdated-table parser still match reality. It installs
// the harness skill into a throwaway repo with the real apm CLI, then runs the
// real `apm outdated` against that repo and parses it. A freshly installed
// latest tag is up-to-date, so the check returns ok:true with an empty behind
// set — the binary the cockpit consumes. It needs network plus auth to the
// private agent-harness repo, so it is gated behind MAESTRO_REAL_APM=1 (the same
// switch as apm-canary.test.ts) and stays out of the fast loop; lacking the env
// it skips loudly rather than passing silently.
//
// Safety: HOME is redirected to a sandbox for every apm subprocess and the
// install targets a throwaway repo dir, so the real ~/.apm and home are never
// touched. apm outdated is read-only; no uninstall is ever run.
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ApmCliDriver } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

const enabled = process.env.MAESTRO_REAL_APM === "1";

// The retired demo Harness, pinned at a historic tag: its trees still carry
// the old root `skills/` subpath, which is what this canary must ask apm for.
// The canonical shape Maestro writes today is `.apm/skills/<name>` (ADR-0021).
const HARNESS = "fimoklei/agent-harness";
const SKILL = "tdd";

describe.runIf(enabled)("real apm outdated canary", () => {
  let home: string;
  let repo: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-outdated-canary-home-"));
    repo = await mkdtemp(join(tmpdir(), "maestro-outdated-canary-repo-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
    await rm(repo, { recursive: true, force: true });
  });

  it("installs a skill then reports it up-to-date via real apm outdated", {
    timeout: 120_000,
  }, async () => {
    // gh's keyring is HOME-independent, so the token survives the redirect.
    const { stdout: tokenOut } = await run("gh", ["auth", "token"]);
    const token = tokenOut.trim();

    const driver = new ApmCliDriver({
      // Merge the caller's env (checkOutdated sets COLUMNS) under the sandbox
      // HOME and token, so neither clobbers the other.
      run: (file, args, options) =>
        run(file, args, {
          ...options,
          env: {
            ...process.env,
            ...options?.env,
            HOME: home,
            GITHUB_TOKEN: token,
          },
        }),
    });

    const resolved = await driver.resolveLatestTag(HARNESS);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      throw new Error(`expected a resolved tag, got ${resolved.reason}`);
    }
    const tag = resolved.tag;
    expect(tag).toMatch(/^v\d+\.\d+\.\d+$/);

    const ref = `github.com/${HARNESS}/skills/${SKILL}#${tag}`;
    // Assert the driver's own verdict, not just the side effects: the install
    // now resolves with a result instead of throwing (#180), so an unasserted
    // call would let a changed apm output shape pass this canary silently.
    const installed = await driver.deploySkill({
      target: { kind: "repo", repoPath: repo },
      ref,
    });
    expect(installed).toEqual({ ok: true });

    const result = await driver.checkOutdated({
      kind: "repo",
      repoPath: repo,
    });
    // A freshly installed latest tag is up-to-date: the check ran (ok:true) and
    // nothing is behind.
    expect(result).toEqual({ ok: true, behind: [] });
  });
});

describe.runIf(!enabled)("real apm outdated canary (skipped)", () => {
  it("is disabled without MAESTRO_REAL_APM=1", () => {
    expect(enabled).toBe(false);
  });
});
