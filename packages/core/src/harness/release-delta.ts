import {
  diffListFile,
  diffPrimitives,
  type HarnessMovement,
  type ListMovement,
  type SubjectMovement,
} from "./harness-movements";
import type { HarnessObject } from "./harness-primitive";
import type { HarnessChange } from "./harness-stages";
import { CATEGORIES_SUBJECT, subjectKey } from "./proposal-subject";
import type { HarnessGitPort, HarnessTag } from "./read-harness-state";

export type PendingMovement = SubjectMovement & {
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
  current: HarnessObject[];
};

type DeltaGit = Pick<
  HarnessGitPort,
  "readPrimitives" | "readListHash" | "readAuthors"
>;

export const readListMovements = async (
  git: Pick<HarnessGitPort, "readListHash">,
  root: string,
  released: HarnessTag | null,
  head: string,
): Promise<ListMovement[] | null> => {
  const current = await git.readListHash(root, head, CATEGORIES_SUBJECT);
  const previous =
    released === null
      ? { hash: null }
      : await git.readListHash(root, released.commit, CATEGORIES_SUBJECT);
  if (current === null || previous === null) {
    return null;
  }
  const moved = diffListFile(CATEGORIES_SUBJECT, previous.hash, current.hash);
  return moved === null ? [] : [moved];
};

export const readReleaseDelta = async (
  git: DeltaGit,
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
  // After every primitive.
  const list = await readListMovements(git, root, released, head);
  if (list === null) {
    return null;
  }
  const movements: SubjectMovement[] = [
    ...diffPrimitives(previous, current),
    ...list,
  ];

  const authored = await git.readAuthors(root, head, movements);
  const orphaned = movements.filter(
    (movement) =>
      movement.kind === "removed" && authored[subjectKey(movement)] == null,
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
        authored[subjectKey(movement)] ??
        atRelease[subjectKey(movement)] ??
        null,
    })),
  };
};
