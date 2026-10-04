// Removes a skill's folder from the Working Harness's disk: no commit or push (#798).
import { join } from "node:path";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isValidSkillSlug } from "../deploy/package-ref";
import { isWithinRoot } from "../filesystem/path-containment";
import { HARNESS_SKILLS_DIR } from "../inventory/harness-layout";
import type { FileSystemPort } from "../registry/file-system";
import type { HarnessGitPort, HarnessSkillTrees } from "./read-harness-state";

export type DeleteLocalSkillError =
  | "not-configured"
  | "invalid-skill"
  | "already-gone"
  | "no-answer"
  // The folder no longer holds the tree the confirmation was given against.
  | "confirmation-stale"
  | "not-local-only"
  // Outside this Harness's skills folder: removing it would delete something else.
  | "destination-unsafe"
  | "delete-failed"
  | "delete-in-progress";

export type DeleteLocalSkillResult =
  | { ok: true; name: string }
  | { ok: false; error: DeleteLocalSkillError };

// A folder outside the clone has nothing to delete, so it carries no facts.
export type SkillDeletionCheck =
  | { inClone: false }
  | {
      inClone: true;
      workingTree: string;
      // The working tree differs from the last commit.
      uncommitted: boolean;
      // In no ref: not on the default branch, local HEAD or a proposal branch.
      localOnly: boolean;
    };

export type DeletionCheckResult =
  | { ok: true; skills: Record<string, SkillDeletionCheck> }
  | { ok: false; error: "not-configured" | "no-answer" };

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

  async inspect(): Promise<DeletionCheckResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const trees = await this.deps.git.readMovementTrees(root).catch(() => null);
    if (trees === null) {
      return { ok: false, error: "no-answer" };
    }
    const names = new Set(Object.values(trees).flatMap(Object.keys));
    const skills: Record<string, SkillDeletionCheck> = {};
    for (const name of names) {
      skills[name] = checkSkill(trees, name);
    }
    return { ok: true, skills };
  }

  // Shares the harness-root lock with the publish path.
  async execute(
    name: string,
    seenWorkingTree: string,
  ): Promise<DeleteLocalSkillResult> {
    if (!isValidSkillSlug(name)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const run = await this.deps.locks.run(root, () =>
      this.remove(root, name, seenWorkingTree),
    );
    return run.ok ? run.value : { ok: false, error: "delete-in-progress" };
  }

  private async remove(
    root: string,
    name: string,
    seenWorkingTree: string,
  ): Promise<DeleteLocalSkillResult> {
    // Re-read at the press, never taken from the row.
    const trees = await this.deps.git.readMovementTrees(root).catch(() => null);
    if (trees === null) {
      return { ok: false, error: "no-answer" };
    }
    const check = checkSkill(trees, name);
    if (!check.inClone) {
      return { ok: false, error: "already-gone" };
    }
    if (check.workingTree !== seenWorkingTree) {
      return { ok: false, error: "confirmation-stale" };
    }
    if (!check.localOnly) {
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

const checkSkill = (
  trees: HarnessSkillTrees,
  name: string,
): SkillDeletionCheck => {
  const workingTree = Object.hasOwn(trees.working, name)
    ? trees.working[name]
    : undefined;
  if (workingTree === undefined) {
    return { inClone: false };
  }
  return {
    inClone: true,
    workingTree,
    uncommitted: workingTree !== trees.local[name],
    localOnly:
      !Object.hasOwn(trees.remote, name) &&
      !Object.hasOwn(trees.local, name) &&
      !Object.hasOwn(trees.promote, name),
  };
};
