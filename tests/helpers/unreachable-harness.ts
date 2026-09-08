// The harness ports every "nothing connected" stub shares. One file, so a new
// method on the git port is added once rather than in each stub beside it. The
// shape is checked where each stub passes it to its use case.
const unreachable = (): never => {
  throw new Error("stub harness git port was reached");
};

export const unreachableHarnessGit = () => ({
  fetch: unreachable,
  readFacts: unreachable,
  readSkillTrees: unreachable,
  readSkillAuthors: unreachable,
  readMovementTrees: unreachable,
  mergeBaseCommit: unreachable,
  readSkillManifests: unreachable,
  publishTag: unreachable,
  pushSkillPromotion: unreachable,
  pushSkillDeletion: unreachable,
  readWorktreeAmbiguity: unreachable,
});

// The review port a "nothing connected" stub gets: no capability at all, so a
// stage degrades instead of a stub throwing on a read nobody asked for.
export const unavailableHarnessReview = () => ({
  readReviews: async () => ({ outcome: "unavailable" }) as const,
});

export const unfetchedFreshness = () => ({
  read: async () => ({ outcome: null, lastFetchedAt: null }) as const,
  record: async () => {},
});
