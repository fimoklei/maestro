// Adapter: ask the local inventory clone the git questions apm cannot answer
// (apm view is repo-level). execFile with an args array and a `--` path
// separator — tag and name go in as data, never command text (security.md).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { InventoryGitPort } from "./deploy-skill";

const run = promisify(execFile);

export class InventoryGitAdapter implements InventoryGitPort {
  private readonly deps: {
    // The inventory clone root, resolved per call so a path saved after
    // startup is picked up (same contract as the inventory reader).
    resolveRoot: () => Promise<string | undefined>;
  };

  constructor(deps: InventoryGitAdapter["deps"]) {
    this.deps = deps;
  }

  async skillExistsAtTag(tag: string, name: string): Promise<boolean> {
    const root = await this.root();
    // ls-tree exits 0 with empty output for a path absent from the tag's
    // tree, and rejects for a tag the clone does not have — a stale clone
    // surfaces as an error instead of masquerading as "not published".
    const { stdout } = await run("git", [
      "-C",
      root,
      "ls-tree",
      "--name-only",
      tag,
      "--",
      `skills/${name}`,
    ]);
    return stdout.trim().length > 0;
  }

  async skillDivergesFromTag(tag: string, name: string): Promise<boolean> {
    const root = await this.root();
    const subtree = `skills/${name}`;

    // Tracked changes: diff --quiet exits 1 when the working tree differs
    // from the tag's subtree, 0 when identical, anything else is a real
    // git failure that must propagate (caught as deploy-failed upstream).
    try {
      await run("git", ["-C", root, "diff", "--quiet", tag, "--", subtree]);
    } catch (error) {
      if ((error as { code?: number }).code === 1) {
        return true;
      }
      throw error;
    }

    // Untracked files: invisible to git diff, but a file the tag does not
    // contain is still drift the deploy would silently drop.
    const { stdout } = await run("git", [
      "-C",
      root,
      "ls-files",
      "--others",
      "--exclude-standard",
      "--",
      subtree,
    ]);
    return stdout.trim().length > 0;
  }

  private async root(): Promise<string> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      throw new Error("inventory root is not configured");
    }
    return root;
  }
}
