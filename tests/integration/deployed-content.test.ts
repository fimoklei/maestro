// A deploy runs `-t claude,codex`, so the guard must check both the .claude
// and .agents copies against the lockfile's deployed_file_hashes.
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeployedContentAdapter } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sha = (contents: Buffer | string) =>
  `sha256:${createHash("sha256").update(contents).digest("hex")}`;

describe("DeployedContentAdapter", () => {
  let root: string;

  const adapter = () =>
    new DeployedContentAdapter({
      location: {
        treeRoot: () => root,
        lockfilePath: () => join(root, "apm.lock.yaml"),
      },
    });

  const writeDeployed = async (relPath: string, contents: Buffer | string) => {
    const abs = join(root, relPath);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, contents);
  };

  const writeLockfile = async (
    name: string,
    hashes: Record<string, string>,
    packageType = "claude_skill",
  ) => {
    const lines = Object.entries(hashes).map(
      ([path, hash]) => `      ${path}: ${hash}`,
    );
    const yaml = [
      "dependencies:",
      `  - virtual_path: .apm/skills/${name}`,
      `    package_type: ${packageType}`,
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

  it("reports lockfile-malformed for a present but non-YAML lockfile", async () => {
    // An unreadable lockfile must never stand in for "nothing is deployed" (#58).
    await writeFile(
      join(root, "apm.lock.yaml"),
      "dependencies: [unterminated\n",
      "utf8",
    );

    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("lockfile-malformed");
  });

  it("reports lockfile-malformed for a present lockfile of the wrong shape", async () => {
    await writeDeployed(".claude/skills/tdd/SKILL.md", "deployed\n");
    await writeFile(
      join(root, "apm.lock.yaml"),
      "dependencies: not-a-list\n",
      "utf8",
    );

    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("lockfile-malformed");
  });

  it("reports lockfile-malformed when this skill's own entry cannot be read", async () => {
    // The view skips an uninterpretable entry (#357); the guard must not read
    // that skip as "nothing deployed" (#58).
    await writeDeployed(".claude/skills/tdd/SKILL.md", "deployed\n");
    await writeFile(
      join(root, "apm.lock.yaml"),
      "dependencies:\n  - virtual_path: skills/tdd\n    package_type: claude_skill\n    source: local\n",
      "utf8",
    );

    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("lockfile-malformed");
  });

  it("leaves another skill readable when one entry cannot be read", async () => {
    await writeDeployed(".claude/skills/tdd/SKILL.md", "deployed\n");
    await writeFile(
      join(root, "apm.lock.yaml"),
      [
        "dependencies:",
        "  - virtual_path: skills/local-one",
        "    package_type: claude_skill",
        "    source: local",
        "  - virtual_path: skills/tdd",
        "    package_type: claude_skill",
        "    resolved_ref: v0.5.1",
        "    deployed_file_hashes:",
        `      .claude/skills/tdd/SKILL.md: ${sha("deployed\n")}`,
        "",
      ].join("\n"),
      "utf8",
    );

    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("clean");
  });

  it("reports unverifiable for a legacy entry with no recorded hashes", async () => {
    await writeDeployed(".claude/skills/tdd/SKILL.md", "deployed long ago\n");
    await writeFile(
      join(root, "apm.lock.yaml"),
      [
        "dependencies:",
        "  - virtual_path: .apm/skills/tdd",
        "    package_type: claude_skill",
        "    resolved_ref: v0.4.0",
        "",
      ].join("\n"),
      "utf8",
    );

    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("unverifiable");
  });

  it("reports unverifiable when deployed files exist with no lockfile entry", async () => {
    // No baseline to verify a copy on disk against: refuse (#56).
    await writeDeployed(".claude/skills/tdd/SKILL.md", "manually placed\n");

    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("unverifiable");
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

  it("reports not-deployed when the deployed copy was fully deleted", async () => {
    // Every recorded file is gone, so a re-deploy restores it: a first deploy,
    // not a divergence (#65).
    await writeLockfile("tdd", {
      ".claude/skills/tdd/SKILL.md": sha("body\n"),
      ".agents/skills/tdd/SKILL.md": sha("body\n"),
    });

    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("not-deployed");
  });

  it("diverges when only some recorded files were deleted (partial)", async () => {
    // A surviving file may carry a local edit; only a fully empty target has
    // nothing to lose (#65).
    const body = "body\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", body);
    await writeLockfile("tdd", {
      ".claude/skills/tdd/SKILL.md": sha(body),
      ".claude/skills/tdd/refactoring.md": sha("reference\n"),
    });

    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("diverged");
  });

  it("reports unreadable when a deploy subtree is a file, not a directory", async () => {
    await writeDeployed(".claude/skills/tdd", "a file, not a directory\n");

    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("unreadable");
  });

  // chmod 000 has no effect when the process runs as root (CI sometimes does).
  const runsAsRoot = process.getuid?.() === 0;
  it.skipIf(runsAsRoot)(
    "reports unreadable when a deployed file cannot be read mid-walk",
    async () => {
      const body = "body\n";
      await writeDeployed(".claude/skills/tdd/SKILL.md", body);
      await writeLockfile("tdd", { ".claude/skills/tdd/SKILL.md": sha(body) });
      await chmod(join(root, ".claude/skills/tdd/SKILL.md"), 0o000);

      await expect(
        adapter().classify({
          target: { kind: "repo", repoPath: root },
          name: "tdd",
        }),
      ).resolves.toBe("unreadable");
    },
  );

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

  it("is clean when both the .claude and .agents copies match", async () => {
    const body = "---\nname: tdd\n---\nbody\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", body);
    await writeDeployed(".agents/skills/tdd/SKILL.md", body);
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

  it("diverges when the codex .agents copy is edited but .claude is clean", async () => {
    const body = "---\nname: tdd\n---\nbody\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", body);
    await writeDeployed(".agents/skills/tdd/SKILL.md", "edited codex copy\n");
    await writeLockfile("tdd", {
      ".claude/skills/tdd/SKILL.md": sha(body),
      ".agents/skills/tdd/SKILL.md": sha(body),
    });

    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("diverged");
  });

  it("diverges on an edited .agents copy the lockfile never recorded", async () => {
    // No lock entry mentions .agents, but the deploy overwrites it: scan the
    // deploy targets, not just the recorded paths (#56).
    const body = "---\nname: tdd\n---\nbody\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", body);
    await writeDeployed(".agents/skills/tdd/SKILL.md", "edited codex copy\n");
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

  it("hashes file bytes, so a clean non-UTF-8 asset is not falsely diverged", async () => {
    // Reading as utf8 would mangle a binary asset and block its deploy forever.
    const bytes = Buffer.from([0xff, 0xfe, 0x00, 0x10, 0x80]);
    await writeDeployed(".claude/skills/tdd/logo.png", bytes);
    await writeLockfile("tdd", {
      ".claude/skills/tdd/logo.png": sha(bytes),
    });

    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("clean");
  });

  it("verifies a copy apm recorded under a package type it could not manage", async () => {
    const body = "deployed\n";
    await writeDeployed(".claude/skills/tdd/SKILL.md", body);
    await writeLockfile(
      "tdd",
      { ".claude/skills/tdd/SKILL.md": sha(body) },
      "hybrid",
    );

    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("clean");
  });

  // Maestro never forwards apm's prose, so the path is recomputed here from
  // the deploy's subtrees and the notice can name one `rm` (#748).
  describe("linkedSkillPath", () => {
    it("names the leaf skill directory that is a symlink", async () => {
      await mkdir(join(root, "elsewhere/tdd"), { recursive: true });
      await mkdir(join(root, ".claude/skills"), { recursive: true });
      await symlink(
        join(root, "elsewhere/tdd"),
        join(root, ".claude/skills/tdd"),
      );

      await expect(
        adapter().linkedSkillPath({
          target: { kind: "repo", repoPath: root },
          name: "tdd",
        }),
      ).resolves.toBe(join(root, ".claude/skills/tdd"));
    });

    it("returns null when every destination is a real directory or absent", async () => {
      await mkdir(join(root, ".claude/skills/tdd"), { recursive: true });

      await expect(
        adapter().linkedSkillPath({
          target: { kind: "repo", repoPath: root },
          name: "tdd",
        }),
      ).resolves.toBeNull();
    });

    it("checks only the tools this deploy targeted", async () => {
      await mkdir(join(root, "elsewhere/tdd"), { recursive: true });
      await mkdir(join(root, ".agents/skills"), { recursive: true });
      await symlink(
        join(root, "elsewhere/tdd"),
        join(root, ".agents/skills/tdd"),
      );

      await expect(
        adapter().linkedSkillPath({
          target: { kind: "repo", repoPath: root },
          name: "tdd",
          tools: ["claude"],
        }),
      ).resolves.toBeNull();
    });
  });

  describe("contentDigest", () => {
    it("changes when a byte of the deployed copy changes", async () => {
      await writeDeployed(".claude/skills/tdd/SKILL.md", "first edit");
      const before = await adapter().contentDigest({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
        tools: ["claude"],
      });

      await writeDeployed(".claude/skills/tdd/SKILL.md", "second edit");
      const after = await adapter().contentDigest({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
        tools: ["claude"],
      });

      expect(before).not.toBeNull();
      expect(after).not.toBe(before);
    });

    it("reads an absent copy as an empty digest, not as a failure", async () => {
      await expect(
        adapter().contentDigest({
          target: { kind: "repo", repoPath: root },
          name: "tdd",
          tools: ["claude"],
        }),
      ).resolves.toBe("");
    });
  });
});
