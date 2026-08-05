// Shared test helper: a PublishRelease with no harness connected, for tests
// that exercise other routes but must satisfy createApp's publish dependency.
// The release route is never hit in those scenarios — it is covered in
// server-harness-release.test.ts. No root means the git port is never reached.
import { PublishRelease } from "@maestro/core";

const unreachable = (): never => {
  throw new Error("stub publish git port was reached");
};

export function stubPublish(): PublishRelease {
  return new PublishRelease({
    resolveRoot: async () => undefined,
    git: {
      fetch: unreachable,
      readFacts: unreachable,
      readSkillTrees: unreachable,
      readSkillAuthors: unreachable,
      readMovementTrees: unreachable,
      readSkillManifests: unreachable,
      publishTag: unreachable,
    },
    freshness: {
      read: async () => ({ outcome: null, lastFetchedAt: null }),
      record: async () => {},
    },
  });
}
