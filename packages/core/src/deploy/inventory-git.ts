// Asks the local inventory clone the git questions apm cannot answer. The `--`
// separator keeps tag and name data, never command text (security.md).
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
    // Resolved per call, so a path saved after startup is picked up.
    resolveRoot: () => Promise<string | undefined>;
  };

  constructor(deps: InventoryGitAdapter["deps"]) {
    this.deps = deps;
  }

  // Catches the clone up with what a merged promotion actually released
  // (#666), by the same rule as the Harness Read (#978). An offline fetch
  // still catches up to the refs this clone already holds.
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
    // ls-tree rejects for a tag the clone does not have, so a stale clone
    // surfaces as an error instead of masquerading as "not published".
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

  // What is on disk under the skill, tracked or not, against the tag's own
  // tree: reading only the tracked tree called promote's untracked but
  // byte-identical copy a divergence (#750).
  async skillDivergesFromTag(tag: string, name: string): Promise<boolean> {
    const root = await this.root();
    const subtree = harnessSkillSubpath(name);
    const indexDir = await mkdtemp(join(tmpdir(), "maestro-inventory-index-"));
    const options = indexOptions(join(indexDir, "index"));

    try {
      // Seeded from HEAD, because git exempts only already-tracked files from
      // the ignore rules.
      await run("git", ["-C", root, "read-tree", "HEAD"], options);
      // No pathspec: one naming the skill is fatal where neither HEAD nor the
      // disk has it, which is the state that must read as diverged.
      await run("git", ["-C", root, "add", "-A"], options);
      // Exit 1 is a difference and only here; any other non-zero, and every
      // failure of the two commands above, is a real git failure that must
      // propagate rather than read as one answer or the other.
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

  // The release side of the local-copy guard: blob bytes hashed the way apm
  // records a deployed file. Null for every failure alike, which the guard
  // reads as no proof of equality (#952).
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
