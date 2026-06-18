// The destination content-drift guard, against a real deployed subtree on disk:
// does the deployed copy still match the per-file sha256 apm recorded in the
// lockfile's deployed_file_hashes? A deploy runs `-t claude,codex`, so BOTH the
// .claude and .agents copies are overwritten — the guard must check both.
// (Mechanism spiked in .claude/rules/apm-driver.md; refuse-only in DeploySkill.)
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeployedContentAdapter } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sha = (contents: Buffer | string) =>
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

  const writeDeployed = async (relPath: string, contents: Buffer | string) => {
    const abs = join(root, relPath);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, contents);
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

  it("reports lockfile-malformed for a present but non-YAML lockfile", async () => {
    // A present lockfile that does not parse must surface as a distinct error,
    // never as the empty-disk "not-deployed" shortcut — an unreadable lockfile
    // can never stand in for "nothing is deployed" and let a deploy proceed (#58).
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
    // Valid YAML, but dependencies is not the expected array of entries. With a
    // deployed copy on disk this used to swallow to "unverifiable"; a malformed
    // lockfile is its own visible refusal, distinct from a verifiable-but-legacy
    // copy (#58).
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

  it("reports unverifiable for a legacy entry with no recorded hashes", async () => {
    // A pre-0.20.0 install records the entry but no deployed_file_hashes, so the
    // deployed copy could hold edits we cannot detect. Distinct from a true
    // first deploy: refuse rather than silently overwrite (#56).
    await writeDeployed(".claude/skills/tdd/SKILL.md", "deployed long ago\n");
    await writeFile(
      join(root, "apm.lock.yaml"),
      [
        "dependencies:",
        "  - virtual_path: skills/tdd",
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
    // No entry at all, but a deployed copy sits on disk (manually copied, stale
    // or deleted lockfile, an install never recorded for this target). The
    // deploy would overwrite it, so refuse rather than treat it as a clean first
    // install — there is no baseline to verify it against (#56).
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
    // The lockfile still records hashes, but every deployed file is gone (the
    // user deleted .claude/skills/<name>). Nothing sits on disk to overwrite, so
    // a re-deploy restores it — this is a first deploy, not a divergence to
    // refuse. Treating it as diverged was a factually-wrong "local edits"
    // refusal that blocked the very re-deploy that fixes it (ADR-0006, #65).
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
    // One of two recorded files is gone, one remains. This is not an empty
    // target — a surviving file may carry a local edit a deploy would silently
    // reset, so it must route to the refuse/confirm path, not auto-proceed.
    // "Nothing to lose" applies only to a fully-empty target (ADR-0006, #65).
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
    // A regular file sits where .claude/skills/<name> should be a directory, so
    // readdir fails ENOTDIR. That is not "missing" — the destination cannot be
    // read, so we cannot prove it safe to overwrite. Refuse rather than swallow
    // it to empty and let the deploy proceed (the silent-overwrite #59 closes).
    await writeDeployed(".claude/skills/tdd", "a file, not a directory\n");

    await expect(
      adapter().classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
      }),
    ).resolves.toBe("unreadable");
  });

  // chmod 000 has no effect when the process runs as root (CI sometimes does),
  // so a read still succeeds there — skip rather than assert a false negative.
  const runsAsRoot = process.getuid?.() === 0;
  it.skipIf(runsAsRoot)(
    "reports unreadable when a deployed file cannot be read mid-walk",
    async () => {
      // The directory walks fine but a file inside it is unreadable (EACCES). A
      // read failure mid-walk is an unreadable destination, not absence: refuse,
      // never miscategorise it as a generic apm execution failure (#59).
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
    // A deploy runs -t claude,codex, so a two-tool install records and overwrites
    // both copies. Both clean -> nothing to lose -> clean (J07).
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
    // The guard must cover BOTH copies the deploy overwrites: editing only the
    // .agents copy is still data a same-ref install would silently reset (#56).
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
    // A prior single-tool install recorded only .claude hashes, but the deploy
    // runs -t claude,codex and will overwrite .agents too. An edited .agents
    // copy on disk must be caught even though no lock entry mentions it — scan
    // the deploy targets, not just the recorded paths (#56).
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
    // apm records a byte-for-byte sha256; reading as utf8 would mangle a binary
    // asset and block its deploy forever. Hash the raw bytes (#56).
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
});
