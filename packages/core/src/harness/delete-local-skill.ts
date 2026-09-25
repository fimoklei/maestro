// Removes a skill that exists only on the Working Harness's disk: no commit or push (#798).
import { join } from "node:path";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isWithinRoot } from "../filesystem/path-containment";
import { HARNESS_SKILLS_DIR } from "../inventory/harness-layout";
import type { FileSystemPort } from "../registry/file-system";
import { isPromotableSkillName } from "./promote-branch";
import type { HarnessGitPort } from "./read-harness-state";

export type DeleteLocalSkillError =
  | "not-configured"
  | "invalid-skill"
  | "already-gone"
  // Also where the local refs gave no answer.
  | "not-local-only"
  | "destination-unsafe"
  | "delete-failed"
  | "delete-in-progress";

export type DeleteLocalSkillResult =
  | { ok: true; name: string }
  | { ok: false; error: DeleteLocalSkillError };

export class DeleteLocalSkill {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    fs: Pick<FileSystemPort, "realpath" | "remove">;
    git: Pick<HarnessGitPort, "readMovementTrees">;
    locks: InFlightLocks;
  };

  constructor(deps: DeleteLocalSkill["deps"]) {
    this.deps = deps;
  }

  // Shares the harness-root lock with the publish path.
  async execute(name: string): Promise<DeleteLocalSkillResult> {
    if (!isPromotableSkillName(name)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const run = await this.deps.locks.run(root, () => this.remove(root, name));
    return run.ok ? run.value : { ok: false, error: "delete-in-progress" };
  }

  private async remove(
    root: string,
    name: string,
  ): Promise<DeleteLocalSkillResult> {
    // Re-read at the press, never taken from the row.
    const trees = await this.deps.git.readMovementTrees(root).catch(() => null);
    if (trees === null) {
      return { ok: false, error: "not-local-only" };
    }
    if (!Object.hasOwn(trees.working, name)) {
      return { ok: false, error: "already-gone" };
    }
    if (
      Object.hasOwn(trees.remote, name) ||
      Object.hasOwn(trees.local, name) ||
      Object.hasOwn(trees.promote, name)
    ) {
      return { ok: false, error: "not-local-only" };
    }

    const folder = await this.resolveFolder(root, name);
    if (folder === null) {
      return { ok: false, error: "destination-unsafe" };
    }
    try {
      await this.deps.fs.remove(folder);
    } catch {
      return { ok: false, error: "delete-failed" };
    }
    return { ok: true, name };
  }

  // A symlinked skill folder resolves to its target and fails the second test.
  private async resolveFolder(
    root: string,
    name: string,
  ): Promise<string | null> {
    try {
      const realRoot = await this.deps.fs.realpath(root);
      const skills = await this.deps.fs.realpath(
        join(root, HARNESS_SKILLS_DIR),
      );
      const folder = await this.deps.fs.realpath(join(skills, name));
      return isWithinRoot(skills, realRoot) && isWithinRoot(folder, skills)
        ? folder
        : null;
    } catch {
      return null;
    }
  }
}
