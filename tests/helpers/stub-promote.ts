// Every way a skill leaves the working tree, with no harness connected.
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
    deleteLocalSkill: new DeleteLocalSkill({
      ...deps,
      fs: {
        realpath: async (path) => path,
        remove: async () => {},
      },
    }),
    restoreSkill: new RestoreSkill({
      ...deps,
      fs: { realpath: async (path) => path },
      copyFs: new NodeCopyTreeFs(),
    }),
    proposals: new ProposalActions(deps),
  };
}
