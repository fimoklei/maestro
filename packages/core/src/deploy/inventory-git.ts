import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexOptions } from "../git/non-interactive";
import { runGitProcess } from "../git/run-git-text";
import { MAESTRO_TAGS } from "../harness/harness-git";
import type { ReleasedContentReader } from "../harness/released-content";
import { harnessSkillSubpath } from "../inventory/harness-layout";
import { ProcessFailedError, stdoutOf } from "../process/run-process";
import type { InventoryGitPort } from "./deploy-skill";

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
    const listing = stdoutOf(
      await runGitProcess(root, [
        "ls-tree",
        "--name-only",
        await tagRef(root, tag),
        "--",
        harnessSkillSubpath(name),
      ]),
    );
    return listing.trim().length > 0;
  }

  async skillDivergesFromTag(tag: string, name: string): Promise<boolean> {
    const root = await this.root();
    const subtree = harnessSkillSubpath(name);
    const indexDir = await mkdtemp(join(tmpdir(), "maestro-inventory-index-"));
    const options = indexOptions(join(indexDir, "index"));

    try {
      stdoutOf(await runGitProcess(root, ["read-tree", "HEAD"], options));
      stdoutOf(await runGitProcess(root, ["add", "-A"], options));
      const compared = await runGitProcess(
        root,
        [
          "diff-index",
          "--quiet",
          "--cached",
          await tagRef(root, tag),
          "--",
          subtree,
        ],
        options,
      );
      if (compared.ok) {
        return false;
      }
      if (compared.failure === "failed" && compared.exitCode === 1) {
        return true;
      }
      throw new ProcessFailedError(compared);
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
  }

  async readSkillFilesAtTag(
    tag: string,
    name: string,
  ): Promise<Record<string, string> | null> {
    const root = await this.deps.resolveRoot().catch(() => undefined);
    if (root === undefined) {
      return null;
    }
    const files = await this.deps.released
      .skillFiles(root, await tagRef(root, tag), name)
      .catch(() => null);
    return files === null || Object.keys(files).length === 0 ? null : files;
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
  const resolved = await runGitProcess(root, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${fetched}^{commit}`,
  ]);
  return resolved.ok ? fetched : `refs/tags/${tag}`;
}
