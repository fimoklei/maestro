// The real global-install canary (issue #35): proves the genuine
// `apm install <ref> -g -t claude,codex` round-trip that the automated suite
// otherwise only exercises against a faked driver. When enabled it shells out
// to the real apm CLI against a throwaway sandbox HOME and asserts what only
// real apm can prove: the skill lands under both deployed targets on disk, and
// apm's own global lockfile pins the tag we resolved. Whether the endpoint
// shapes that lockfile into the right response is the fast lane's job
// (server-global-deploy-state.test.ts) — a second copy here only rots, because
// only this file is gated behind an env var (#187). The sandbox HOME is seeded
// with every supported tool's presence marker first, because the install target
// derives from live detection (ADR-0011); an unseeded home detects nothing and
// the round-trip has nothing to prove. It needs network plus auth to the private
// agent-harness repo, so it is gated behind MAESTRO_REAL_APM=1 (the same switch
// as apm-canary.test.ts) and stays out of the fast loop; lacking the env it
// skips loudly rather than passing silently.
//
// Safety: HOME is redirected to the sandbox for every apm subprocess, so the
// real ~/.apm, ~/.claude/skills, and ~/.agents/skills are never touched, and
// `apm uninstall -g` (which once deleted 19 real skill dirs) is never run.
import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { ApmCliDriver, DEPLOY_TOOLS, ToolPresenceAdapter } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

const enabled = process.env.MAESTRO_REAL_APM === "1";

// The demo Harness at its latest tag. Its skills live under the canonical
// `.apm/skills/<name>` subpath (ADR-0021); the old root `skills/` tree was
// dropped at v0.6.0, so asking apm for it fails validation.
const HARNESS = "fimoklei/agent-harness";
const SUBPATH = ".apm/skills";
const SKILL = "tdd";

describe.runIf(enabled)("real apm global install canary", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-global-canary-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("installs the skill globally and surfaces it at its pinned tag", {
    timeout: 120_000,
  }, async () => {
    // gh's keyring is HOME-independent, so the token survives the redirect.
    const { stdout: tokenOut } = await run("gh", ["auth", "token"]);
    const token = tokenOut.trim();

    // Presence is detected live from each tool's own config file under the
    // deploy's HOME (ADR-0011), so the sandbox home must look like a machine
    // that runs every supported tool before deploy and read can agree. The
    // markers come from DEPLOY_TOOLS rather than literals, so this canary
    // still follows the single source of truth when a tool is added.
    for (const tool of DEPLOY_TOOLS) {
      const marker = join(home, tool.globalPresenceMarker);
      await mkdir(dirname(marker), { recursive: true });
      await writeFile(marker, "");
    }
    const detected = await new ToolPresenceAdapter({
      homeRoot: () => home,
    }).detectGlobalTools();
    expect(detected).toEqual(DEPLOY_TOOLS.map((tool) => tool.apmTarget));

    // Every apm subprocess runs with HOME pointed at the sandbox, so the real
    // home is never touched. The scratch cwd lives under it too: apm appends
    // apm_modules/ to the cwd's .gitignore even for -g, so it must never be a
    // real repo (apm-driver.md, J07).
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
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      throw new Error(`expected a resolved tag, got ${resolved.reason}`);
    }
    const tag = resolved.tag;
    expect(tag).toMatch(/^v\d+\.\d+\.\d+$/);

    const ref = `github.com/${HARNESS}/${SUBPATH}/${SKILL}#${tag}`;
    // A global install targets exactly the detected tools (ADR-0011), so the
    // deploy is fed live detection rather than a literal set that could drift
    // away from what the machine has.
    // The driver reports its own verdict rather than throwing (#180), so assert
    // it: otherwise a real apm whose output stopped matching the success shape
    // would still write the files checked below and pass this canary, while
    // production reported deploy-failed.
    const installed = await driver.deploySkill({
      target: { kind: "global" },
      ref,
      tools: detected,
    });
    expect(installed).toEqual({ ok: true });

    // Both deployed targets land under the sandbox home: the claude skills dir
    // and the cross-client agents dir. Assert the file, not the directory — apm
    // can create one and deploy nothing into it (research/772 § F1).
    for (const toolDir of [".claude", ".agents"]) {
      await expect(
        access(join(home, toolDir, "skills", SKILL, "SKILL.md")),
      ).resolves.toBeUndefined();
    }

    // apm pinned the tag we resolved, recorded in its own global lockfile.
    // Reading the raw text keeps this canary on what only real apm proves;
    // parsing that lockfile and shaping it into a response is the fast lane's
    // job (tests/integration/server-global-deploy-state.test.ts).
    const lock = await readFile(join(home, ".apm", "apm.lock.yaml"), "utf8");
    expect(lock).toContain(`virtual_path: ${SUBPATH}/${SKILL}`);
    expect(lock).toContain(`resolved_ref: ${tag}`);
    // The per-file hashes are Maestro's drift baseline (apm-driver.md
    // § Lockfile), so a global install that omits them leaves drift unmeasurable.
    expect(lock).toContain("deployed_file_hashes:");
  });
});

describe.runIf(!enabled)("real apm global install canary (skipped)", () => {
  it("is disabled without MAESTRO_REAL_APM=1", () => {
    expect(enabled).toBe(false);
  });
});
