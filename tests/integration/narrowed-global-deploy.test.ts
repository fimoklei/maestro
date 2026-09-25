// Which copies survive a narrowing global deploy: only a tool that owns its
// skills directory outright is cleaned, never one that shares it (#202).
// Sandbox HOME only: the real home is never touched.
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
import {
  rootPackageApm,
  rootPackageSelection,
} from "../helpers/root-package-apm";

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

  // Only the cleanup adapter and the filesystem are real.
  const deployGlobally = async (present: SupportedTool[]) => {
    const env = { HOME: home } as NodeJS.ProcessEnv;
    // The install never writes the copies, so anything gone was deleted by
    // the reconciliation, not by apm.
    const apm = rootPackageApm({ globalRoot: home, placesFiles: false });
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
        deploySkill: apm.deploySkill,
      },
      selection: rootPackageSelection({
        globalRoot: home,
        configPath: join(home, "config.json"),
        apm,
      }),
      inventoryOriginUrl: async () =>
        "git@github.com:fimoklei/agent-harness.git",
      inventoryGit: {
        syncBeforeDeploy: async () => {},
        skillExistsAtTag: async () => true,
        skillDivergesFromTag: async () => false,
        readSkillFilesAtTag: async () => null,
      },
      recordedPackage: {
        read: async () => ({
          kind: "recorded" as const,
          reading: { kind: "skill" as const, name: "tdd" },
        }),
      },
      deployedContent: {
        contentDigest: async () => null,
        classify: async () => "not-deployed" as const,
        linkedSkillPath: async () => null,
      },
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
    // Ten apm targets deploy under .agents, so an absent Codex is never proof
    // the tree is dead.
    const result = await deployGlobally(["claude"]);

    expect(result.ok).toBe(true);
    expect(await exists(join(home, ".agents/skills/tdd/SKILL.md"))).toBe(true);
    expect(await exists(join(home, ".claude/skills/tdd/SKILL.md"))).toBe(true);
  });

  it("still removes the exclusive .claude tree when Claude Code is undetected", async () => {
    // Only Claude Code reads its skills folder, so its absence proves that copy
    // dead.
    const result = await deployGlobally(["codex"]);

    expect(result.ok).toBe(true);
    expect(await exists(join(home, ".claude/skills/tdd"))).toBe(false);
    expect(await exists(join(home, ".agents/skills/tdd/SKILL.md"))).toBe(true);
  });
});
