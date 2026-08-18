// Shared test helper: both ways a movement reaches review, with no harness
// connected, for tests that exercise other routes but must satisfy createApp's
// dependencies. Returned as one object so a third route added here does not
// touch every caller again. No root means the git port is never reached.
//
// The routes themselves are covered in `server-harness-promote.test.ts`.
import {
  InFlightLocks,
  PromoteSkill,
  PromoteSkillDeletion,
} from "@maestro/core";
import {
  unfetchedFreshness,
  unreachableHarnessGit,
} from "./unreachable-harness";

export function stubPromotes(): {
  promote: PromoteSkill;
  promoteDeletion: PromoteSkillDeletion;
} {
  const deps = {
    resolveRoot: async () => undefined,
    git: unreachableHarnessGit(),
    freshness: unfetchedFreshness(),
    locks: new InFlightLocks(),
  };
  return {
    promote: new PromoteSkill(deps),
    promoteDeletion: new PromoteSkillDeletion(deps),
  };
}
