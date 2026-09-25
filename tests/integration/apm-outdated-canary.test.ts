// Needs network and auth to the private agent-harness repo, so it runs only
// with MAESTRO_REAL_APM=1 and skips loudly otherwise (#46). HOME points at a
// sandbox for every apm subprocess.
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ApmCliDriver } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

const enabled = process.env.MAESTRO_REAL_APM === "1";

// The old root `skills/` tree was dropped at v0.6.0; asking apm for it fails.
const HARNESS = "fimoklei/agent-harness";
const SUBPATH = ".apm/skills";
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

    const ref = `github.com/${HARNESS}/${SUBPATH}/${SKILL}#${tag}`;
    // The install resolves with a verdict instead of throwing (#180); without this
    // assert a changed output shape would pass silently.
    const installed = await driver.deploySkill({
      target: { kind: "repo", repoPath: repo },
      ref,
    });
    expect(installed).toEqual({ ok: true });

    const result = await driver.checkOutdated({
      kind: "repo",
      repoPath: repo,
    });
    expect(result).toEqual({ ok: true, behind: [] });
  });
});

describe.runIf(!enabled)("real apm outdated canary (skipped)", () => {
  it("is disabled without MAESTRO_REAL_APM=1", () => {
    expect(enabled).toBe(false);
  });
});
