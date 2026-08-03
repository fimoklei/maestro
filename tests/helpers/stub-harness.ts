// Shared test helper: a ReadHarnessState with no harness connected, for tests
// that exercise other routes but must satisfy createApp's harness dependency.
// The harness routes are never hit in those scenarios — they are covered in
// server-harness.test.ts. No root means the git port is never reached.
import { ReadHarnessState } from "@maestro/core";

const unreachable = (): never => {
  throw new Error("stub harness git port was reached");
};

export function stubHarness(): ReadHarnessState {
  return new ReadHarnessState({
    resolveRoot: async () => undefined,
    git: {
      fetch: unreachable,
      readFacts: unreachable,
      readSkillTrees: unreachable,
    },
    freshness: {
      read: async () => ({ outcome: null, lastFetchedAt: null }),
      record: async () => {},
    },
  });
}
