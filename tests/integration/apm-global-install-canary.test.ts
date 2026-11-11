// Needs network and auth to the private agent-harness repo, so it runs only
// with MAESTRO_REAL_APM=1 and skips loudly otherwise (#35). HOME points at a
// sandbox for every apm subprocess; never run `apm uninstall -g` here.
import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  ApmCliDriver,
  DEPLOY_TOOLS,
  DeployedLocation,
  ToolPresenceAdapter,
} from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lenientRealpath } from "../../packages/core/src/filesystem/lenient-realpath";
import { nodeApp } from "../helpers/node-app";

const run = promisify(execFile);

const enabled = process.env.MAESTRO_REAL_APM === "1";

// The old root `skills/` tree was dropped at v0.6.0; asking apm for it fails.
const HARNESS = "fimoklei/agent-harness";
const SUBPATH = ".apm/skills";
const SKILL = "tdd";

describe.runIf(enabled)("real apm global install canary", () => {
  let home: string;

  beforeEach(async () => {
    // A symlinked HOME makes apm ≥0.29.0 deploy nothing.
    home = await realpath(
      await mkdtemp(join(tmpdir(), "maestro-global-canary-")),
    );
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

    // Install targets come from live detection, so the sandbox home must carry
    // every supported tool's presence marker or the round-trip proves nothing.
    for (const tool of DEPLOY_TOOLS) {
      const marker = join(home, tool.globalPresenceMarker);
      await mkdir(dirname(marker), { recursive: true });
      await writeFile(marker, "");
    }
    const detected = await new ToolPresenceAdapter({
      location: new DeployedLocation({ HOME: home }, lenientRealpath),
    }).detectGlobalTools();
    expect(detected).toEqual(DEPLOY_TOOLS.map((tool) => tool.apmTarget));

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
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      throw new Error(`expected a resolved tag, got ${resolved.reason}`);
    }
    const tag = resolved.tag;
    expect(tag).toMatch(/^v\d+\.\d+\.\d+$/);

    const ref = `github.com/${HARNESS}/${SUBPATH}/${SKILL}#${tag}`;
    // The driver reports its verdict rather than throwing (#180): without this
    // assert, output that stopped matching the success shape would still pass.
    const installed = await driver.deploySkill({
      target: { kind: "global" },
      ref,
      tools: detected,
    });
    expect(installed).toEqual({ ok: true });

    // Assert the file, not the directory: apm can create one and deploy nothing.
    for (const toolDir of [".claude", ".agents"]) {
      await expect(
        access(join(home, toolDir, "skills", SKILL, "SKILL.md")),
      ).resolves.toBeUndefined();
    }

    const lock = await readFile(join(home, ".apm", "apm.lock.yaml"), "utf8");
    expect(lock).toContain(`virtual_path: ${SUBPATH}/${SKILL}`);
    expect(lock).toContain(`resolved_ref: ${tag}`);
    expect(lock).toContain("deployed_file_hashes:");
  });
});

describe.runIf(enabled)(
  "real apm global install under CLAUDE_CONFIG_DIR (#1796)",
  () => {
    let home: string;

    beforeEach(async () => {
      home = await realpath(
        await mkdtemp(join(tmpdir(), "maestro-claude-config-canary-")),
      );
    });

    afterEach(async () => {
      await rm(home, { recursive: true, force: true });
    });

    it("reads back the skill apm wrote into the variable's folder", {
      timeout: 120_000,
    }, async () => {
      const { stdout: tokenOut } = await run("gh", ["auth", "token"]);
      const env = {
        HOME: home,
        MAESTRO_HOME: join(home, ".maestro"),
        CLAUDE_CONFIG_DIR: join(home, ".claude-work"),
      };
      const location = new DeployedLocation(env, lenientRealpath);
      for (const marker of Object.values(location.presenceMarkers())) {
        await mkdir(dirname(marker), { recursive: true });
        await writeFile(marker, "");
      }
      const toolPresence = new ToolPresenceAdapter({ location });
      const detected = await toolPresence.detectGlobalTools();
      expect(detected).toEqual(["claude", "codex"]);

      const scratchCwd = join(home, ".apm-scratch");
      const driver = new ApmCliDriver({
        run: (file, args, options) =>
          run(file, args, {
            ...options,
            env: { ...process.env, ...env, GITHUB_TOKEN: tokenOut.trim() },
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
      const installed = await driver.deploySkill({
        target: { kind: "global" },
        ref: `github.com/${HARNESS}/${SUBPATH}/${SKILL}#${resolved.tag}`,
        tools: detected,
      });
      expect(installed).toEqual({ ok: true });
      await expect(
        access(join(home, ".claude-work", "skills", SKILL, "SKILL.md")),
      ).resolves.toBeUndefined();

      const res = await nodeApp(env, { toolPresence }).request(
        "/api/deploy-state/global",
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        folders: { path: string; primitives: { name: string }[] }[];
      };
      expect(
        body.folders.map((f) => [f.path, f.primitives.map((p) => p.name)]),
      ).toEqual([
        ["~/.claude-work/skills", [SKILL]],
        ["~/.agents/skills", [SKILL]],
      ]);
    });
  },
);

describe.runIf(!enabled)("real apm global install canary (skipped)", () => {
  it("is disabled without MAESTRO_REAL_APM=1", () => {
    expect(enabled).toBe(false);
  });
});
