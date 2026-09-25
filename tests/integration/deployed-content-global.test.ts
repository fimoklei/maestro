// Drives the real DeployedLocation: the global lockfile lives under ~/.apm but
// its hash keys are HOME-relative (#61), so the tree root must be HOME. A root
// flipped to ~/.apm would misclassify a clean skill and turn these red.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeployedContentAdapter,
  DeployedLocation,
  type DeployTarget,
} from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sha = (contents: string) =>
  `sha256:${createHash("sha256").update(contents).digest("hex")}`;

describe("DeployedContentAdapter — global target", () => {
  let home: string;
  const target: DeployTarget = { kind: "global" };

  const adapter = () => {
    const env = { HOME: home } as NodeJS.ProcessEnv;
    return new DeployedContentAdapter({
      location: new DeployedLocation(env),
    });
  };

  const writeDeployed = async (relPath: string, contents: string) => {
    const abs = join(home, relPath);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, contents, "utf8");
  };

  const writeGlobalLockfile = async (hashes: Record<string, string>) => {
    const lines = Object.entries(hashes).map(
      ([path, hash]) => `      ${path}: ${hash}`,
    );
    const yaml = [
      "dependencies:",
      "  - virtual_path: .apm/skills/tdd",
      "    package_type: claude_skill",
      "    resolved_ref: v0.5.1",
      "    deployed_file_hashes:",
      ...lines,
      "    content_hash: sha256:opaque",
      "",
    ].join("\n");
    await mkdir(join(home, ".apm"), { recursive: true });
    await writeFile(join(home, ".apm", "apm.lock.yaml"), yaml, "utf8");
  };

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-global-content-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("classifies a clean global skill as clean, not a false local-edit refusal", async () => {
    const skill = "---\nname: tdd\n---\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", skill);
    await writeDeployed(".agents/skills/tdd/SKILL.md", skill);
    await writeGlobalLockfile({
      ".claude/skills/tdd/SKILL.md": sha(skill),
      ".agents/skills/tdd/SKILL.md": sha(skill),
    });

    await expect(adapter().classify({ target, name: "tdd" })).resolves.toBe(
      "clean",
    );
  });

  it("does not refuse a single-tool redeploy over a prior two-tool lockfile", async () => {
    // Codex was dropped after a two-tool install (#136): the absent, untargeted
    // .agents copy is not this deploy's drift.
    const skill = "---\nname: tdd\n---\n";
    await writeGlobalLockfile({
      ".claude/skills/tdd/SKILL.md": sha(skill),
      ".agents/skills/tdd/SKILL.md": sha(skill),
    });
    await writeDeployed(".claude/skills/tdd/SKILL.md", skill);

    await expect(
      adapter().classify({ target, name: "tdd", tools: ["claude"] }),
    ).resolves.toBe("clean");
  });

  it("still catches an edit in a targeted tool when scoped", async () => {
    const skill = "---\nname: tdd\n---\n";
    await writeGlobalLockfile({
      ".claude/skills/tdd/SKILL.md": sha(skill),
      ".agents/skills/tdd/SKILL.md": sha(skill),
    });
    await writeDeployed(".claude/skills/tdd/SKILL.md", `${skill}edited\n`);

    await expect(
      adapter().classify({ target, name: "tdd", tools: ["claude"] }),
    ).resolves.toBe("diverged");
  });

  it("classifies an edited global deployed copy as diverged", async () => {
    const skill = "---\nname: tdd\n---\n";
    await writeGlobalLockfile({
      ".claude/skills/tdd/SKILL.md": sha(skill),
      ".agents/skills/tdd/SKILL.md": sha(skill),
    });
    await writeDeployed(".claude/skills/tdd/SKILL.md", `${skill}edited\n`);
    await writeDeployed(".agents/skills/tdd/SKILL.md", skill);

    await expect(adapter().classify({ target, name: "tdd" })).resolves.toBe(
      "diverged",
    );
  });
});
