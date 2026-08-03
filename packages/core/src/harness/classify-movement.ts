// Where one skill sits, from tree hashes alone — never `git diff` and never
// commit ancestry, so merge, squash and rebase all read the same (ADR-0021).
// `null` at any position means the skill is absent there, and that compares
// like any other value: an absent skill differs from a present one.

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
  // Differing from local HEAD is what separates the author's own edit from a
  // clone that is merely behind: behind, the disk agrees with HEAD and only
  // the remote has moved. A local commit no one has pushed reads the same as
  // being behind through hashes alone, so it is deliberately not claimed.
  if (working !== remote && working !== local) {
    return "pending-promotion";
  }
  return null;
};
