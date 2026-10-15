// The `--` separator keeps tag and name data, never command text.
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { indexOptions } from "../git/non-interactive";
import { MAESTRO_TAGS } from "../harness/harness-git";
import type { ReleasedContentReader } from "../harness/released-content";
import { harnessSkillSubpath } from "../inventory/harness-layout";
import type { InventoryGitPort } from "./deploy-skill";

const run = promisify(execFile);

export class InventoryGitAdapter implements InventoryGitPort {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    released: ReleasedContentReader;
  };

  constructor(deps: InventoryGitAdapter["deps"]) {
    this.deps = deps;
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
      await tagRef(root, tag),
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
        [
          "-C",
          root,
          "diff-index",
          "--quiet",
          "--cached",
          await tagRef(root, tag),
          "--",
          subtree,
        ],
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
    try {
      const root = await this.root();
      const files = await this.deps.released.skillFiles(
        root,
        await tagRef(root, tag),
        name,
      );
      return files === null || Object.keys(files).length === 0 ? null : files;
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

// Maestro's fetched tag first: a release published from Maestro is pushed,
// never tagged locally (#1213), and a moved tag updates only the fetched copy.
// The local tag only where the fetched one is absent.
async function tagRef(root: string, tag: string): Promise<string> {
  const fetched = `${MAESTRO_TAGS}/${tag}`;
  return run("git", [
    "-C",
    root,
    "rev-parse",
    "--verify",
    "--quiet",
    `${fetched}^{commit}`,
  ]).then(
    () => fetched,
    () => `refs/tags/${tag}`,
  );
}
