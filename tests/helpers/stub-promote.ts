// Both ways a movement reaches review, with no harness connected, for tests
// that exercise other routes but must satisfy createApp. One object, so a
// third route does not touch every caller (routes: server-harness-promote).
import {
  InFlightLocks,
  PromoteSkill,
  PromoteSkillDeletion,
  ProposalActions,
} from "@maestro/core";
import {
  unavailableHarnessReview,
  unfetchedFreshness,
  unreachableHarnessGit,
} from "./unreachable-harness";

export function stubPromotes(): {
  promote: PromoteSkill;
  promoteDeletion: PromoteSkillDeletion;
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
    proposals: new ProposalActions(deps),
  };
}
