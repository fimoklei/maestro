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

export const unfetchedFreshness = () => ({
  read: async () => ({ outcome: null, lastFetchedAt: null }) as const,
  record: async () => {},
});
