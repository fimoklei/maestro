// The `--` separator keeps tag and name data, never command text.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { catchUpClone } from "../git/catch-up-clone";
import { gitOptions, indexOptions } from "../git/non-interactive";
import { harnessSkillSubpath } from "../inventory/harness-layout";
import type { InventoryGitPort } from "./deploy-skill";

const run = promisify(execFile);

export class InventoryGitAdapter implements InventoryGitPort {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
  };

  constructor(deps: InventoryGitAdapter["deps"]) {
    this.deps = deps;
  }

  // An offline fetch still catches up to the refs this clone holds (#666).
  async syncBeforeDeploy(): Promise<void> {
    const root = await this.root();
    await run(
      "git",
      ["-C", root, "fetch", "origin", "--tags"],
      gitOptions(),
    ).catch(() => {});
    await catchUpClone(root);
  }

  async skillExistsAtTag(tag: string, name: string): Promise<boolean> {
    const root = await this.root();
    // Rejects for a tag the clone lacks, so a stale clone is an error, not
    // "not published".
    const { stdout } = await run("git", [
      "-C",
      root,
      "ls-tree",
      "--name-only",
      tag,
      "--",
      harnessSkillSubpath(name),
    ]);
    return stdout.trim().length > 0;
  }

  // Compares disk, tracked or not, against the tag's tree (#750).
  async skillDivergesFromTag(tag: string, name: string): Promise<boolean> {
    const root = await this.root();
    const subtree = harnessSkillSubpath(name);
    const indexDir = await mkdtemp(join(tmpdir(), "maestro-inventory-index-"));
    const options = indexOptions(join(indexDir, "index"));

    try {
      // Seeded from HEAD: git exempts only tracked files from the ignore rules.
      await run("git", ["-C", root, "read-tree", "HEAD"], options);
      // No pathspec: one naming the skill is fatal where neither HEAD nor the
      // disk has it, which must read as diverged.
      await run("git", ["-C", root, "add", "-A"], options);
      // Only exit 1 means a difference; every other failure propagates.
      return await run(
        "git",
        ["-C", root, "diff-index", "--quiet", "--cached", tag, "--", subtree],
        options,
      ).then(
        () => false,
        (error: { code?: number }) => {
          if (error.code === 1) {
            return true;
          }
          throw error;
        },
      );
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
  }

  // Blob bytes hashed the way apm records a deployed file. Null for every
  // failure, which the guard reads as no proof of equality (#952).
  async readSkillFilesAtTag(
    tag: string,
    name: string,
  ): Promise<Record<string, string> | null> {
    const subtree = harnessSkillSubpath(name);
    try {
      const root = await this.root();
      // -z, so a path holding a quote or a newline survives the split.
      const { stdout } = await run(
        "git",
        ["-C", root, "ls-tree", "-r", "-z", "--name-only", tag, "--", subtree],
        gitOptions(),
      );
      const paths = stdout.split("\0").filter((path) => path.length > 0);
      if (paths.length === 0) {
        return null;
      }
      const files: Record<string, string> = {};
      for (const path of paths) {
        const { stdout: bytes } = await run(
          "git",
          ["-C", root, "show", `${tag}:${path}`],
          { ...gitOptions(), encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
        );
        files[path.slice(subtree.length + 1)] =
          `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
      }
      return files;
    } catch {
      return null;
    }
  }

  private async root(): Promise<string> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      throw new Error("inventory root is not configured");
    }
    return root;
  }
}
