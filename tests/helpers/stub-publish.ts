// A PublishRelease with no harness connected, for tests that must satisfy
// createApp's publish dependency; no root means the git port is never reached.
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
