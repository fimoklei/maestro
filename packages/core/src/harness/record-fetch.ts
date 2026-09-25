// A failed fetch never overwrites the last success time (#516).
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
