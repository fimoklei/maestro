// A ReadHarnessState with no harness connected, for tests that must satisfy
// createApp's harness dependency; no root means the git port is never reached.
import { ReadHarnessState } from "@maestro/core";
import {
  unavailableHarnessReview,
  unfetchedFreshness,
  unreachableHarnessGit,
} from "./unreachable-harness";

export function stubHarness(): ReadHarnessState {
  return new ReadHarnessState({
    resolveRoot: async () => undefined,
    git: unreachableHarnessGit(),
    freshness: unfetchedFreshness(),
    review: unavailableHarnessReview(),
  });
}
