// The destination content-drift guard, against a real deployed subtree on disk:
// does the deployed copy (.claude/skills/<name>) still match the per-file
// sha256 apm recorded in the lockfile's deployed_file_hashes? (Mechanism spiked
// in .claude/rules/apm-driver.md; refuse-only behaviour wired in DeploySkill.)
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeployedContentAdapter } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sha = (contents: string) =>
  `sha256:${createHash("sha256").update(contents).digest("hex")}`;

describe("DeployedContentAdapter", () => {
  let root: string;

  // Resolves both roots to the temp dir: the lockfile sits at <root>/apm.lock.yaml
  // and deployed_file_hashes keys are relative to <root>, matching a per-repo
  // install. The global path differs only in these two resolvers.
  const adapter = () =>
    new DeployedContentAdapter({
      resolveLockfilePath: () => join(root, "apm.lock.yaml"),
      resolveDeployedRoot: () => root,
    });

  const writeDeployed = async (relPath: string, contents: string) => {
    const abs = join(root, relPath);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, contents, "utf8");
  };

  // Writes a lockfile with one tag-pinned claude_skill entry carrying the given
  // deployed_file_hashes (path -> sha256), mirroring apm 0.20.0's shape.
  const writeLockfile = async (
    name: string,
    hashes: Record<string, string>,
  ) => {
    const lines = Object.entries(hashes).map(
      ([path, hash]) => `      ${path}: ${hash}`,
    );
    const yaml = [
      "dependencies:",
      `  - virtual_path: skills/${name}`,
      "    package_type: claude_skill",
      "    resolved_ref: v0.5.1",
      "    deployed_file_hashes:",
      ...lines,
      "    content_hash: sha256:opaque",
      "",
    ].join("\n");
    await writeFile(join(root, "apm.lock.yaml"), yaml, "utf8");
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "maestro-deployed-content-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reports not-deployed when the target has no lockfile", async () => {
    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("not-deployed");
  });

  it("reports not-deployed when the lockfile has no entry for the skill", async () => {
    await writeLockfile("other", { ".claude/skills/other/SKILL.md": sha("x") });
    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("not-deployed");
  });

  it("is clean when every deployed file matches its recorded hash", async () => {
    const body = "---\nname: tdd\n---\nbody\n";
    const ref = "reference\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", body);
    await writeDeployed(".claude/skills/tdd/refactoring.md", ref);
    await writeLockfile("tdd", {
      ".claude/skills/tdd/SKILL.md": sha(body),
      ".claude/skills/tdd/refactoring.md": sha(ref),
    });

    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("clean");
  });

  it("diverges when a deployed file was edited after install", async () => {
    const original = "---\nname: tdd\n---\noriginal\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", "edited locally\n");
    await writeLockfile("tdd", {
      ".claude/skills/tdd/SKILL.md": sha(original),
    });

    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("diverged");
  });

  it("diverges on an untracked file the lockfile never recorded", async () => {
    const body = "---\nname: tdd\n---\nbody\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", body);
    await writeDeployed(".claude/skills/tdd/STRAY.md", "not from the tag\n");
    await writeLockfile("tdd", {
      ".claude/skills/tdd/SKILL.md": sha(body),
    });

    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("diverged");
  });

  it("ignores the .agents copy a two-tool install also records", async () => {
    // A claude target must classify only its own .claude subtree; the codex
    // .agents copy shares the same per-file hash but is not this tree (J07).
    const body = "---\nname: tdd\n---\nbody\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", body);
    await writeLockfile("tdd", {
      ".claude/skills/tdd/SKILL.md": sha(body),
      ".agents/skills/tdd/SKILL.md": sha(body),
    });

    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("clean");
  });
});
