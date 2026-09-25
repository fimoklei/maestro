// A narrowed global deploy leaves apm's codex copy behind; the cleanup removes
// exactly that subtree, never through `apm uninstall -g`, which deletes beyond
// its lockfile.
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeployedCleanupAdapter,
  DeployedLocation,
  type DeployTarget,
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

describe("DeployedCleanupAdapter — global target", () => {
  let home: string;
  const target: DeployTarget = { kind: "global" };

  const adapter = () => {
    const env = { HOME: home } as NodeJS.ProcessEnv;
    return new DeployedCleanupAdapter({
      location: new DeployedLocation(env),
    });
  };

  const writeDeployed = async (relPath: string, contents: string) => {
    const abs = join(home, relPath);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, contents, "utf8");
  };

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-cleanup-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("removes the obsolete codex copy while leaving the claude copy intact", async () => {
    await writeDeployed(".claude/skills/tdd/SKILL.md", "claude\n");
    await writeDeployed(".agents/skills/tdd/SKILL.md", "codex\n");

    await adapter().removeSkillTargets({
      target,
      name: "tdd",
      tools: ["codex"],
    });

    expect(await exists(join(home, ".agents/skills/tdd"))).toBe(false);
    expect(await exists(join(home, ".claude/skills/tdd/SKILL.md"))).toBe(true);
  });

  it("is a no-op when the obsolete copy is already gone", async () => {
    await writeDeployed(".claude/skills/tdd/SKILL.md", "claude\n");

    await expect(
      adapter().removeSkillTargets({ target, name: "tdd", tools: ["codex"] }),
    ).resolves.toBeUndefined();

    expect(await exists(join(home, ".claude/skills/tdd/SKILL.md"))).toBe(true);
  });

  it("removes only the named skill, not a sibling skill's copy", async () => {
    await writeDeployed(".agents/skills/tdd/SKILL.md", "codex\n");
    await writeDeployed(".agents/skills/other/SKILL.md", "codex\n");

    await adapter().removeSkillTargets({
      target,
      name: "tdd",
      tools: ["codex"],
    });

    expect(await exists(join(home, ".agents/skills/tdd"))).toBe(false);
    expect(await exists(join(home, ".agents/skills/other/SKILL.md"))).toBe(
      true,
    );
  });
});
