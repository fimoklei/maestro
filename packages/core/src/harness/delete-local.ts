import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isValidSkillSlug } from "../deploy/package-ref";
import type { FileSystemPort } from "../registry/file-system";
import {
  type HarnessPrimitiveType,
  type PrimitiveRef,
  primitivePath,
} from "./harness-primitive";
import {
  inspectPrimitiveEntry,
  type PrimitiveEntryFs,
} from "./harness-primitive-dir";
import type { HarnessGitPort, HarnessHashes } from "./read-harness-state";

export type DeleteLocalError =
  | "not-configured"
  | "invalid-skill"
  | "already-gone"
  | "no-answer"
  | "confirmation-stale"
  | "destination-unsafe"
  | "destination-unreadable"
  | "delete-failed"
  | "delete-in-progress";

export type DeleteLocalResult =
  | { ok: true; name: string }
  | { ok: false; error: DeleteLocalError };

type DeletionChecks = Record<
  HarnessPrimitiveType,
  Record<string, PrimitiveDeletionCheck>
>;

export type PrimitiveDeletionCheck =
  | { inClone: false }
  | {
      inClone: true;
      path: string;
      workingTree: string;
      uncommitted: boolean;
      localOnly: boolean;
    };

export type DeletionCheckResult =
  | { ok: true; checks: DeletionChecks }
  | { ok: false; error: "not-configured" | "no-answer" };

export class DeleteLocal {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    fs: PrimitiveEntryFs & Pick<FileSystemPort, "remove">;
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
    const entry = await inspectPrimitiveEntry(this.deps.fs, root, ref);
    if (entry.kind === "unsafe") {
      return { ok: false, error: "destination-unsafe" };
    }
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
    if (entry.kind === "unreadable") {
      return { ok: false, error: "destination-unreadable" };
    }
    if (entry.kind === "absent") {
      return { ok: false, error: "already-gone" };
    }

    try {
      await this.deps.fs.remove(entry.path);
    } catch {
      return { ok: false, error: "delete-failed" };
    }
    return { ok: true, name: ref.name };
  }
}

const checkPrimitive = (
  trees: HarnessHashes,
  ref: PrimitiveRef,
): PrimitiveDeletionCheck => {
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
