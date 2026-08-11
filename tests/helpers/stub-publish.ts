// Shared test helper: a PublishRelease with no harness connected, for tests
// that exercise other routes but must satisfy createApp's publish dependency.
// The release route is never hit in those scenarios — it is covered in
// server-harness-release.test.ts. No root means the git port is never reached.
import { InFlightLocks, PublishRelease } from "@maestro/core";
import {
  unfetchedFreshness,
  unreachableHarnessGit,
} from "./unreachable-harness";

const unreachable = (): never => {
  throw new Error("stub publish replan was reached");
};

export function stubPublish(): PublishRelease {
  return new PublishRelease({
    resolveRoot: async () => undefined,
    git: unreachableHarnessGit(),
    freshness: unfetchedFreshness(),
    replan: unreachable,
    locks: new InFlightLocks(),
  });
}
