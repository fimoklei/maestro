// The one diff between the latest release and the default branch. The Pending
// release stage, the release plan and the empty-delta refusal all read it, so
// they never disagree (#845).
import { diffPrimitives, type HarnessMovement } from "./harness-movements";
import { type HarnessObject, primitiveKey } from "./harness-primitive";
import type { HarnessChange } from "./harness-stages";
import type { HarnessGitPort, HarnessTag } from "./read-harness-state";

/** A movement with the Change its Pending release row shows. */
export type PendingMovement = HarnessMovement & {
  change: HarnessChange;
  author: string | null;
};

const RELEASE_CHANGE: Record<HarnessMovement["kind"], HarnessChange> = {
  added: "addition",
  changed: "edit",
  renamed: "rename",
  removed: "deletion",
};

export type ReleaseDelta = {
  movements: PendingMovement[];
  // Every primitive at `head`, read once with the movements.
  current: HarnessObject[];
};

// Null where either side could not be read: a delta nobody could compute is
// never empty. Content, not reachability: a tag off the default branch
// compares like any other.
export const readReleaseDelta = async (
  git: Pick<HarnessGitPort, "readPrimitives" | "readAuthors">,
  root: string,
  released: HarnessTag | null,
  head: string,
): Promise<ReleaseDelta | null> => {
  const current = await git.readPrimitives(root, head);
  if (current === null) {
    return null;
  }
  const previous =
    released === null ? [] : await git.readPrimitives(root, released.commit);
  if (previous === null) {
    return null;
  }
  const movements = diffPrimitives(previous, current);

  const authored = await git.readAuthors(root, head, movements);
  // A primitive the default branch never saw has its author on the release ref.
  const orphaned = movements.filter(
    (movement) =>
      movement.kind === "removed" && authored[primitiveKey(movement)] == null,
  );
  const atRelease =
    released !== null && orphaned.length > 0
      ? await git.readAuthors(root, released.commit, orphaned)
      : {};

  return {
    current,
    movements: movements.map((movement) => ({
      ...movement,
      change: RELEASE_CHANGE[movement.kind],
      author:
        authored[primitiveKey(movement)] ??
        atRelease[primitiveKey(movement)] ??
        null,
    })),
  };
};
