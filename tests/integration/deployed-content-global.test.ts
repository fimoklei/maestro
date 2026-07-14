// The destination guard on the GLOBAL path, end-to-end against a real deployed
// subtree under a sandbox HOME. Unlike deployed-content.test.ts (which hardcodes
// both roots to one dir, mirroring a per-repo install), this drives the real
// resolveDeployedRoot/resolveDeployedLockfilePath that production wires into the
// adapter — the global split where the lockfile lives under ~/.apm but the files
// live under HOME. apm keys the global deployed_file_hashes HOME-relative
// (spiked against apm 0.20.0, apm-driver.md #61), so the deployed root must be
// HOME for those keys to match a live sha256. If the wiring regressed (e.g. the
// global root flipped to ~/.apm), the files would not be found there and a clean
// skill would misclassify — these tests would go red.
//
// Sandbox HOME only: the resolvers take an env, so the real ~/.apm and
// ~/.claude/skills are never read.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeployedContentAdapter,
  type DeployTarget,
  resolveDeployedLockfilePath,
  resolveDeployedRoot,
} from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sha = (contents: string) =>
  `sha256:${createHash("sha256").update(contents).digest("hex")}`;

describe("DeployedContentAdapter — global target", () => {
  let home: string;
  const target: DeployTarget = { kind: "global" };

  // The production composition, only with HOME pointed at the sandbox: the
  // lockfile resolves under <home>/.apm, the deployed root to <home>.
  const adapter = () => {
    const env = { HOME: home } as NodeJS.ProcessEnv;
    return new DeployedContentAdapter({
      resolveLockfilePath: (t) => resolveDeployedLockfilePath(t, env),
      resolveDeployedRoot: (t) => resolveDeployedRoot(t, env),
    });
  };

  // Materializes a deployed file under HOME (e.g. .claude/skills/tdd/SKILL.md).
  const writeDeployed = async (relPath: string, contents: string) => {
    const abs = join(home, relPath);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, contents, "utf8");
  };

  // Writes the global lockfile under <home>/.apm with HOME-relative hash keys,
  // mirroring what a real `apm install -g -t claude,codex` records (#61).
  const writeGlobalLockfile = async (hashes: Record<string, string>) => {
    const lines = Object.entries(hashes).map(
      ([path, hash]) => `      ${path}: ${hash}`,
    );
    const yaml = [
      "dependencies:",
      "  - virtual_path: skills/tdd",
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
    // ADR-0011 / #136: a machine that once ran `-t claude,codex` globally has
    // .agents hashes in the lockfile, but after dropping Codex only the .claude
    // copy remains on disk. Scoping the guard to the detected tools (claude) must
    // classify clean — the absent, untargeted .agents copy is not this deploy's
    // drift. Unscoped, the missing .agents file would falsely read as diverged.
    const skill = "---\nname: tdd\n---\n";
    await writeGlobalLockfile({
      ".claude/skills/tdd/SKILL.md": sha(skill),
      ".agents/skills/tdd/SKILL.md": sha(skill),
    });
    // Only the claude copy is on disk; the .agents copy is gone (Codex removed).
    await writeDeployed(".claude/skills/tdd/SKILL.md", skill);

    await expect(
      adapter().classify({ target, name: "tdd", tools: ["claude"] }),
    ).resolves.toBe("clean");
  });

  it("still catches an edit in a targeted tool when scoped", async () => {
    // Scoping must not blind the guard: an edited .claude copy is still drift
    // even when the deploy targets claude only.
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
    // Both copies recorded clean, but the .claude copy was edited after install.
    await writeDeployed(".claude/skills/tdd/SKILL.md", `${skill}edited\n`);
    await writeDeployed(".agents/skills/tdd/SKILL.md", skill);

    await expect(adapter().classify({ target, name: "tdd" })).resolves.toBe(
      "diverged",
    );
  });
});
