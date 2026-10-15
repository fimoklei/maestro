// The one byte-level canary on the real filesystem adapter. Every other
// deployed-content claim runs in core against an in-memory copy tree.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeployedContentAdapter, NodeCopyTreeFs } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sha = (contents: Buffer | string) =>
  `sha256:${createHash("sha256").update(contents).digest("hex")}`;

describe("DeployedContentAdapter, on the real filesystem", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "maestro-deployed-content-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("hashes file bytes, so a clean non-UTF-8 asset is not falsely diverged", async () => {
    // Reading as utf8 would mangle a binary asset and block its deploy forever.
    const bytes = Buffer.from([0xff, 0xfe, 0x00, 0x10, 0x80]);
    await mkdir(join(root, ".claude/skills/tdd"), { recursive: true });
    await writeFile(join(root, ".claude/skills/tdd/logo.png"), bytes);
    await writeFile(
      join(root, "apm.lock.yaml"),
      [
        "dependencies:",
        "  - virtual_path: .apm/skills/tdd",
        "    package_type: claude_skill",
        "    resolved_ref: v0.5.1",
        "    deployed_file_hashes:",
        `      .claude/skills/tdd/logo.png: ${sha(bytes)}`,
        "    content_hash: sha256:opaque",
        "",
      ].join("\n"),
      "utf8",
    );

    const content = new DeployedContentAdapter({
      fs: new NodeCopyTreeFs(),
      location: {
        treeRoot: () => root,
        lockfilePath: () => join(root, "apm.lock.yaml"),
      },
    });
    await expect(
      content.classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
        lockfile: await content.readLockfile({ kind: "repo", repoPath: root }),
      }),
    ).resolves.toBe("clean");
  });

  it("reads a looping lockfile link as malformed, never as no lockfile", async () => {
    await mkdir(join(root, ".claude/skills/tdd"), { recursive: true });
    await writeFile(join(root, ".claude/skills/tdd/SKILL.md"), "skill\n");
    await symlink(join(root, "loop.yaml"), join(root, "apm.lock.yaml"));
    await symlink(join(root, "apm.lock.yaml"), join(root, "loop.yaml"));

    const content = new DeployedContentAdapter({
      fs: new NodeCopyTreeFs(),
      location: {
        treeRoot: () => root,
        lockfilePath: () => join(root, "apm.lock.yaml"),
      },
    });
    await expect(
      content.classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
        lockfile: await content.readLockfile({ kind: "repo", repoPath: root }),
      }),
    ).resolves.toBe("lockfile-malformed");
  });
});
