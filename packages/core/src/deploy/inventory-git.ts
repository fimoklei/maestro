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

  async skillDivergesFromTag(tag: string, name: string): Promise<boolean> {
    const root = await this.root();
    const subtree = harnessSkillSubpath(name);
    const indexDir = await mkdtemp(join(tmpdir(), "maestro-inventory-index-"));
    const options = indexOptions(join(indexDir, "index"));

    try {
      await run("git", ["-C", root, "read-tree", "HEAD"], options);
      await run("git", ["-C", root, "add", "-A"], options);
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
