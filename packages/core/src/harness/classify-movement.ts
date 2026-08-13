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

// origin/HEAD moved past what local HEAD last saw. Never the promote branch
// too — classifyMovement already reads an unmerged branch as pending-review,
// so comparing it here would relabel the author's own review as a teammate's.
//
// A tree-hash difference alone cannot tell "remote moved this skill" from
// "local moved ahead of remote" (ADR-0021 — no ancestry from hashes).
// `atMergeBase` is this skill's tree at the merge base of local HEAD and
// origin/HEAD — the fork point both sides last agreed on. Remote matching it
// means origin/HEAD never touched this skill since the fork, so any
// difference from local is this author's own commit, never a teammate's;
// this is scoped to the one skill, unlike a whole-repo ancestry check, so an
// unrelated commit elsewhere on origin/HEAD never blocks this skill (#579).
// `undefined` (the merge base itself unreadable) falls back to the plain
// comparison — the safer side for a warning that guards against overwriting
// someone else's work.
export const isConcurrentlyChanged = (
  { remote, local }: SkillTreeHashes,
  atMergeBase?: string | null,
) => remote !== local && (atMergeBase === undefined || remote !== atMergeBase);
