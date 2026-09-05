// Asks the local inventory clone the git questions apm cannot answer. The `--`
// separator keeps tag and name data, never command text (security.md).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gitOptions } from "../git/non-interactive";
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
  // (#666). Best-effort: an offline fetch, a missing upstream, or real local
  // edits all leave the clone exactly as it was.
  async syncBeforeDeploy(): Promise<void> {
    const root = await this.root();
    try {
      await run("git", ["-C", root, "fetch", "origin", "--tags"], gitOptions());
      await run(
        "git",
        ["-C", root, "merge", "--ff-only", "@{u}"],
        gitOptions(),
      );
    } catch {
      // Best-effort, per the comment above.
    }
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

  async skillDivergesFromTag(tag: string, name: string): Promise<boolean> {
    const root = await this.root();
    const subtree = harnessSkillSubpath(name);

    // `diff --quiet` exits 1 on a difference; any other non-zero is a real git
    // failure and must propagate.
    try {
      await run("git", ["-C", root, "diff", "--quiet", tag, "--", subtree]);
    } catch (error) {
      if ((error as { code?: number }).code === 1) {
        return true;
      }
      throw error;
    }

    // Untracked files are invisible to `git diff`, but still drift the deploy
    // would silently drop.
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
