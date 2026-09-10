// Every way a skill leaves the working tree, with no harness connected, for
// tests that exercise other routes but must satisfy createApp. One object, so a
// fourth route does not touch every caller (routes: server-harness-promote).
import {
  DeleteLocalSkill,
  InFlightLocks,
  NodeCopyTreeFs,
  PromoteSkill,
  PromoteSkillDeletion,
  ProposalActions,
  RestoreSkill,
} from "@maestro/core";
import {
  unavailableHarnessReview,
  unfetchedFreshness,
  unreachableHarnessGit,
} from "./unreachable-harness";

export function stubPromotes(): {
  promote: PromoteSkill;
  promoteDeletion: PromoteSkillDeletion;
  deleteLocalSkill: DeleteLocalSkill;
  restoreSkill: RestoreSkill;
  proposals: ProposalActions;
} {
  const deps = {
    resolveRoot: async () => undefined,
    git: unreachableHarnessGit(),
    freshness: unfetchedFreshness(),
    locks: new InFlightLocks(),
    review: unavailableHarnessReview(),
  };
  return {
    promote: new PromoteSkill(deps),
    promoteDeletion: new PromoteSkillDeletion(deps),
    // Never reached: with no harness connected the root resolves to nothing,
    // so no filesystem call is made.
    deleteLocalSkill: new DeleteLocalSkill({
      ...deps,
      fs: {
        realpath: async (path) => path,
        remove: async () => {},
      },
    }),
    // Never reached either, and for the same reason.
    restoreSkill: new RestoreSkill({
      ...deps,
      fs: { realpath: async (path) => path },
      copyFs: new NodeCopyTreeFs(),
    }),
    proposals: new ProposalActions(deps),
  };
}
