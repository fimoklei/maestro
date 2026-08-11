// Where one skill sits, from tree hashes alone (ADR-0021).

// A promote branch that carries no tree for its skill is proposing to delete
// it, which is not the same fact as having no promote branch at all.
type PromoteBranch = { tree: string | null };

// `null` is a skill absent at that ref, and compares like any other value: an
// absent skill differs from a present one, which is what makes an addition and
// a deletion fall out of the same two tests below.
export type SkillTreeHashes = {
  /** The skill's tree at `origin/HEAD` — the merged truth. */
  remote: string | null;
  /** Its `maestro/<skill>` promote branch, or null when there is none. */
  promote: PromoteBranch | null;
  /** Its tree at local `HEAD`. */
  local: string | null;
  /** Its tree on disk, untracked files included. */
  working: string | null;
};

export type MovementState = "pending-review" | "pending-promotion";

export const classifyMovement = ({
  remote,
  promote,
  local,
  working,
}: SkillTreeHashes): MovementState | null => {
  // origin/HEAD is tested first, so a branch whose content already merged is
  // over. Anything else is a review still open, an older branch included:
  // proving it merged needs commit ancestry, which ADR-0021 rules out.
  if (promote !== null && promote.tree !== remote) {
    return "pending-review";
  }
  // Differing from local HEAD too is what separates the author's own edit from
  // a clone that is merely behind. It also costs a local commit nobody pushed:
  // through hashes alone the two are the same picture (ADR-0021).
  if (working !== remote && working !== local) {
    return "pending-promotion";
  }
  return null;
};

// A movement that removes a skill from this disk: it was tracked at local HEAD
// and is gone from the working tree. Renames are not inferred, so a moved
// directory is this plus a separate addition, each read on its own (#575).
export const isLocalDeletion = ({ local, working }: SkillTreeHashes): boolean =>
  local !== null && working === null;
