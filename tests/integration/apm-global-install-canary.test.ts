// The real global-install canary (issue #35): proves the genuine
// `apm install <ref> -g -t claude,codex` round-trip that the automated suite
// otherwise only exercises against a faked driver. When enabled it shells out
// to the real apm CLI against a throwaway sandbox HOME, then reads the global
// deploy-state endpoint back from that same HOME — both deployed targets on
// disk and the pinned tag surfaced. It needs network plus auth to the private
// agent-harness repo, so it is gated behind MAESTRO_REAL_APM=1 (the same switch
// as apm-canary.test.ts) and stays out of the fast loop; lacking the env it
// skips loudly rather than passing silently.
//
// Safety: HOME is redirected to the sandbox for every apm subprocess, so the
// real ~/.apm, ~/.claude/skills, and ~/.agents/skills are never touched, and
// `apm uninstall -g` (which once deleted 19 real skill dirs) is never run.
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ApmCliDriver,
  ConfigStore,
  DeployStateReader,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDrift } from "../helpers/stub-drift";

const run = promisify(execFile);

const enabled = process.env.MAESTRO_REAL_APM === "1";

// The canonical harness skill and its origin. apm view is repo-level, so the
// owner/repo plus the skills/<name> subpath is the tag-pinned ref form
// (ADR-0003, apm-driver.md).
const HARNESS = "fimoklei/agent-harness";
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

    const ref = `github.com/${HARNESS}/skills/${SKILL}#${tag}`;
    // A global install targets exactly the detected tools (ADR-0011); the driver
    // fails closed on an empty set, so this canary passes the two-tool set it
    // asserts on below (both .claude and .agents copies land).
    await driver.deploySkill({
      target: { kind: "global" },
      ref,
      tools: ["claude", "codex"],
    });

    // Both deployed targets land under the sandbox home: the claude skills dir
    // and the cross-client agents dir (-t claude,codex writes one lockfile
    // entry with both deployed_files).
    await expect(
      access(join(home, ".claude", "skills", SKILL)),
    ).resolves.toBeUndefined();
    await expect(
      access(join(home, ".agents", "skills", SKILL)),
    ).resolves.toBeUndefined();

    // The global deploy-state endpoint reads the same sandbox home and
    // surfaces the skill at its pinned tag.
    const res = await makeGlobalApp(home).request("/api/deploy-state/global");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      primitives: [{ type: "skill", name: SKILL, version: tag }],
      skipped: [],
    });
  });
});

describe.runIf(!enabled)("real apm global install canary (skipped)", () => {
  it("is disabled without MAESTRO_REAL_APM=1", () => {
    expect(enabled).toBe(false);
  });
});

// The deploy-state endpoint wired to read apm's global root under the sandbox
// home, mirroring the server's production composition (server-side resolution,
// no client-supplied path).
function makeGlobalApp(home: string) {
  const fs = new NodeFileSystem();
  const registry = new Registry({
    fs,
    store: new ConfigStore({ fs, configPath: join(home, "config.json") }),
  });
  const inventory = new InventoryReader({ fs, resolvePath: () => undefined });
  const deployState = new DeployStateReader({ fs });
  return createApp({
    registry,
    inventory,
    deployState,
    deploy: stubDeploy({ inventory, registry }),
    drift: stubDrift({ registry }),
    resolveGlobalRoot: () => join(home, ".apm"),
    connect: stubConnect(),
    browse: stubBrowse(),
    enforceOriginHost: false,
  });
}
