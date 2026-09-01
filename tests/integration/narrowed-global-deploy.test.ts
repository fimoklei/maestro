// Which deployed copies survive a narrowing global deploy, against a real tree
// under a sandbox HOME. DeployedCleanupAdapter removes whatever it is handed
// (deployed-cleanup.test.ts); this proves what DeploySkill hands it — the tool
// that owns its skills directory outright, never one that shares it (#202).
//
// Sandbox HOME only: the resolver takes an env, so the real ~/.agents and
// ~/.claude are never touched.
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeployedCleanupAdapter,
  DeployedLocation,
  DeploySkill,
  InFlightLocks,
  type SupportedTool,
} from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

describe("narrowed global deploy — which copies survive on disk", () => {
  let home: string;

  const writeDeployed = async (relPath: string, contents: string) => {
    const abs = join(home, relPath);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, contents, "utf8");
  };

  // A global deploy of "tdd" on a machine where only `present` is installed.
  // Everything outside the cleanup decision is a minimal in-memory stub; the
  // cleanup adapter and the filesystem are real.
  const deployGlobally = async (present: SupportedTool[]) => {
    const env = { HOME: home } as NodeJS.ProcessEnv;
    const deploy = new DeploySkill({
      inventory: {
        read: async () => ({
          ok: true as const,
          primitives: [
            { type: "skill" as const, name: "tdd", description: "TDD" },
          ],
        }),
      },
      registry: { isRegistered: async () => false },
      apm: {
        resolveLatestTag: async () => ({ ok: true as const, tag: "v0.5.1" }),
        deploySkill: async () => ({ ok: true as const }),
      },
      inventoryOriginUrl: async () =>
        "git@github.com:fimoklei/agent-harness.git",
      inventoryGit: {
        syncBeforeDeploy: async () => {},
        skillExistsAtTag: async () => true,
        skillDivergesFromTag: async () => false,
      },
      // A proven skill record: this journey is not about the post-install read.
      recordedPackage: {
        read: async () => ({
          kind: "recorded" as const,
          reading: { kind: "skill" as const, name: "tdd" },
        }),
      },
      deployedContent: { classify: async () => "not-deployed" as const },
      deployedCleanup: new DeployedCleanupAdapter({
        location: new DeployedLocation(env),
      }),
      toolPresence: { detectGlobalTools: async () => present },
      canonicalPath: async (path: string) => path,
      locks: new InFlightLocks(),
    });
    return deploy.execute({
      type: "skill",
      name: "tdd",
      target: { kind: "global" },
    });
  };

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-narrow-"));
    await writeDeployed(".claude/skills/tdd/SKILL.md", "claude\n");
    await writeDeployed(".agents/skills/tdd/SKILL.md", "shared\n");
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("leaves the shared .agents tree alone when Codex is undetected", async () => {
    // Ten apm targets deploy skills under .agents (docs/apm-behavior.md), so an
    // absent Codex is one missing reader of ten — never proof the tree is dead.
    const result = await deployGlobally(["claude"]);

    expect(result.ok).toBe(true);
    expect(await exists(join(home, ".agents/skills/tdd/SKILL.md"))).toBe(true);
    expect(await exists(join(home, ".claude/skills/tdd/SKILL.md"))).toBe(true);
  });

  it("still removes the exclusive .claude tree when Claude Code is undetected", async () => {
    // Claude Code alone reads .claude/skills/, so its absence does prove that
    // copy is dead wood — ADR-0011's reconciliation survives for this case.
    const result = await deployGlobally(["codex"]);

    expect(result.ok).toBe(true);
    expect(await exists(join(home, ".claude/skills/tdd"))).toBe(false);
    expect(await exists(join(home, ".agents/skills/tdd/SKILL.md"))).toBe(true);
  });
});
