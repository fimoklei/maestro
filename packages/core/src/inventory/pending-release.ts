// A released primitive that a merged change waits to replace. It reads the one
// release diff the Pending release stage reads, so the two never disagree.
import type { HarnessMovement } from "../harness/harness-movements";
import type { PrimitiveRef } from "../harness/harness-primitive";
import type { HarnessChange } from "../harness/harness-stages";
import type { HarnessGitPort } from "../harness/read-harness-state";
import { readReleaseDelta } from "../harness/release-delta";
import { highestReleaseTag } from "../harness/release-tag";

// `renamedTo` is the new name on the default branch, only for a rename.
export type PendingRelease = {
  change: Exclude<HarnessChange, "addition">;
  renamedTo: string | null;
  defaultBranch: string;
} | null;

export type PendingReleaseDelta = {
  movements: HarnessMovement[];
  defaultBranch: string;
};

// Null where no diff could be read: no row then claims a pending change.
export type ReadPendingRelease = (
  root: string,
) => Promise<PendingReleaseDelta | null>;

export const pendingReleaseFromGit =
  (
    git: Pick<HarnessGitPort, "readFacts" | "readPrimitives" | "readAuthors">,
  ): ReadPendingRelease =>
  async (root) => {
    const facts = await git.readFacts(root);
    const head = facts.defaultBranchCommit;
    if (facts.tags === null || head === null || facts.defaultBranch === null) {
      return null;
    }
    const delta = await readReleaseDelta(
      git,
      root,
      highestReleaseTag(facts.tags),
      head,
    );
    return delta === null
      ? null
      : { movements: delta.movements, defaultBranch: facts.defaultBranch };
  };

// An addition never matches: the release holds no row under its name.
export const pendingReleaseOf = (
  ref: PrimitiveRef,
  delta: PendingReleaseDelta | null,
): PendingRelease => {
  const movement = delta?.movements.find(
    (candidate) =>
      candidate.type === ref.type &&
      (candidate.kind === "renamed"
        ? candidate.previousName === ref.name
        : candidate.kind !== "added" && candidate.name === ref.name),
  );
  if (delta == null || movement === undefined) {
    return null;
  }
  return {
    change:
      movement.kind === "renamed"
        ? "rename"
        : movement.kind === "removed"
          ? "deletion"
          : "edit",
    renamedTo: movement.kind === "renamed" ? movement.name : null,
    defaultBranch: delta.defaultBranch,
  };
};
