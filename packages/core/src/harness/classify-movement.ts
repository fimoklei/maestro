// A null tree proposes a deletion, unlike having no promote branch at all.
type PromoteBranch = { tree: string | null };

// `null` is a skill absent at that ref; it compares like any other value.
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

// Renames are not inferred: a moved directory is a deletion plus an addition (#575).
export const isLocalDeletion = ({ local, working }: SkillTreeHashes): boolean =>
  local !== null && working === null;

// Never compares the promote branch: that is the author's own proposal.
// Remote matching `atMergeBase` means only the author changed this skill (#579).
// `undefined` (merge base unreadable) falls back to the plain, safer comparison.
export const isConcurrentlyChanged = (
  { remote, local }: SkillTreeHashes,
  atMergeBase?: string | null,
) => remote !== local && (atMergeBase === undefined || remote !== atMergeBase);
