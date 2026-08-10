// Every reach at the remote is also a freshness reading: what this call found,
// and — untouched by a failure — when one last succeeded. That last time is what
// makes a stale picture readable, so a failed fetch never overwrites it (#516).
import type {
  HarnessFetchOutcome,
  HarnessFreshnessPort,
  HarnessGitPort,
} from "./read-harness-state";

export const recordFetch = async (
  deps: { git: HarnessGitPort; freshness: HarnessFreshnessPort },
  root: string,
  at: Date,
): Promise<HarnessFetchOutcome> => {
  const outcome = await deps.git.fetch(root);
  const previous = await deps.freshness.read(root);
  await deps.freshness.record(root, {
    outcome,
    lastFetchedAt:
      outcome === "fetched" ? at.toISOString() : previous.lastFetchedAt,
  });
  return outcome;
};
