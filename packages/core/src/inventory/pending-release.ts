import type { SubjectMovement } from "../harness/harness-movements";
import type { PrimitiveRef } from "../harness/harness-primitive";
import type { HarnessChange } from "../harness/harness-stages";
import type { HarnessGitPort } from "../harness/read-harness-state";
import { readReleaseDelta } from "../harness/release-delta";
import { highestReleaseTag } from "../harness/release-tag";

export type PendingRelease = {
  change: Exclude<HarnessChange, "addition">;
  renamedTo: string | null;
  defaultBranch: string;
} | null;

export type PendingReleaseDelta = {
  movements: SubjectMovement[];
  defaultBranch: string;
};

export type ReadPendingRelease = (
  root: string,
) => Promise<PendingReleaseDelta | null>;

export const pendingReleaseFromGit =
  (
    git: Pick<
      HarnessGitPort,
      "readFacts" | "readPrimitives" | "readListHash" | "readAuthors"
    >,
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
