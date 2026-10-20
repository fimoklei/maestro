// Removes a primitive's folder or file from the Working Harness's disk: no commit or push
// (#798). A skill on the default branch goes the same way; Propose change then
// carries the deletion to the Curator (#1370).
import { join } from "node:path";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isValidSkillSlug } from "../deploy/package-ref";
import { isWithinRoot } from "../filesystem/path-containment";
import type { FileSystemPort } from "../registry/file-system";
import {
  type HarnessPrimitiveType,
  type PrimitiveRef,
  primitiveEntry,
  primitivePath,
} from "./harness-primitive";
import { resolveHarnessPrimitiveDir } from "./harness-primitive-dir";
import type { HarnessGitPort, HarnessHashes } from "./read-harness-state";

export type DeleteLocalError =
  | "not-configured"
  | "invalid-skill"
  | "already-gone"
  | "no-answer"
  // The folder no longer holds the tree the confirmation was given against.
  | "confirmation-stale"
  // Outside this Harness's skills folder: removing it would delete something else.
  | "destination-unsafe"
  | "delete-failed"
  | "delete-in-progress";

export type DeleteLocalResult =
  | { ok: true; name: string }
  | { ok: false; error: DeleteLocalError };

// Per type, then per name.
type DeletionChecks = Record<
  HarnessPrimitiveType,
  Record<string, SkillDeletionCheck>
>;

// A folder outside the clone has nothing to delete, so it carries no facts.
export type SkillDeletionCheck =
  | { inClone: false }
  | {
      inClone: true;
      // The folder or file in the Harness, as the dialog names it.
      path: string;
      workingTree: string;
      // The working tree differs from the last commit.
      uncommitted: boolean;
      // In no ref: not on the default branch, local HEAD or a proposal branch.
      localOnly: boolean;
    };

export type DeletionCheckResult =
  | { ok: true; checks: DeletionChecks }
  | { ok: false; error: "not-configured" | "no-answer" };

export class DeleteLocal {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    fs: Pick<FileSystemPort, "realpath" | "remove">;
    git: Pick<HarnessGitPort, "readMovementTrees">;
    locks: InFlightLocks;
  };

  constructor(deps: DeleteLocal["deps"]) {
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
    const checksOf = (type: HarnessPrimitiveType) => {
      const hashes = trees[type];
      const names = new Set(Object.values(hashes).flatMap(Object.keys));
      return Object.fromEntries(
        [...names].map((name) => [
          name,
          checkPrimitive(hashes, { type, name }),
        ]),
      );
    };
    return {
      ok: true,
      checks: { skill: checksOf("skill"), prompt: checksOf("prompt") },
    };
  }

  // Shares the harness-root lock with the publish path.
  async execute(
    ref: PrimitiveRef,
    seenWorkingTree: string,
  ): Promise<DeleteLocalResult> {
    if (!isValidSkillSlug(ref.name)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const run = await this.deps.locks.run(root, () =>
      this.remove(root, ref, seenWorkingTree),
    );
    return run.ok ? run.value : { ok: false, error: "delete-in-progress" };
  }

  private async remove(
    root: string,
    ref: PrimitiveRef,
    seenWorkingTree: string,
  ): Promise<DeleteLocalResult> {
    // Re-read at the press, never taken from the row.
    const trees = await this.deps.git.readMovementTrees(root).catch(() => null);
    if (trees === null) {
      return { ok: false, error: "no-answer" };
    }
    const check = checkPrimitive(trees[ref.type], ref);
    if (!check.inClone) {
      return { ok: false, error: "already-gone" };
    }
    if (check.workingTree !== seenWorkingTree) {
      return { ok: false, error: "confirmation-stale" };
    }

    const folder = await this.resolveTarget(root, ref);
    if (folder === null) {
      return { ok: false, error: "destination-unsafe" };
    }
    try {
      await this.deps.fs.remove(folder);
    } catch {
      return { ok: false, error: "delete-failed" };
    }
    return { ok: true, name: ref.name };
  }

  // A symlinked folder or file resolves to its target and fails the containment test.
  private async resolveTarget(
    root: string,
    ref: PrimitiveRef,
  ): Promise<string | null> {
    const resolved = await resolveHarnessPrimitiveDir(
      this.deps.fs,
      root,
      ref.type,
    );
    if (!resolved.ok) {
      return null;
    }
    try {
      const target = await this.deps.fs.realpath(
        join(resolved.dir, primitiveEntry(ref)),
      );
      return isWithinRoot(target, resolved.dir) ? target : null;
    } catch {
      return null;
    }
  }
}

const checkPrimitive = (
  trees: HarnessHashes,
  ref: PrimitiveRef,
): SkillDeletionCheck => {
  const { name } = ref;
  const workingTree = Object.hasOwn(trees.working, name)
    ? trees.working[name]
    : undefined;
  if (workingTree === undefined) {
    return { inClone: false };
  }
  return {
    inClone: true,
    path: primitivePath(ref),
    workingTree,
    uncommitted: workingTree !== trees.local[name],
    localOnly:
      !Object.hasOwn(trees.remote, name) &&
      !Object.hasOwn(trees.local, name) &&
      !Object.hasOwn(trees.promote, name),
  };
};
