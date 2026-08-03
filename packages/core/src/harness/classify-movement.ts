// Where one skill sits, from tree hashes alone (ADR-0021).

// `null` is a skill absent at that ref, and compares like any other value: an
// absent skill differs from a present one, which is what makes an addition and
// a deletion fall out of the same two tests below.
export type SkillTreeHashes = {
  /** The skill's tree at `origin/HEAD` — the merged truth. */
  remote: string | null;
  /** Its tree on `maestro/<skill>`, the promote branch, or null if there is none. */
  promote: string | null;
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
  // origin/HEAD is tested first, so a promote branch whose content already
  // merged is over, and a branch left on an older revision is stale rather
  // than a review the team is waiting on.
  if (promote !== null && promote !== remote) {
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
