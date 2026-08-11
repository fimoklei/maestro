// Shared test helper: a PromoteSkill with no harness connected, for tests that
// exercise other routes but must satisfy createApp's promote dependency. The
// promote route is covered in server-harness-promote.test.ts. No root means the
// git port is never reached.
import { InFlightLocks, PromoteSkill } from "@maestro/core";
import {
  unfetchedFreshness,
  unreachableHarnessGit,
} from "./unreachable-harness";

export function stubPromote(): PromoteSkill {
  return new PromoteSkill({
    resolveRoot: async () => undefined,
    git: unreachableHarnessGit(),
    freshness: unfetchedFreshness(),
    locks: new InFlightLocks(),
  });
}
