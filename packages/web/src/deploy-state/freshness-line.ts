import { ago } from "../harness/harness-view-model";

// Band 2's freshness line: the oldest answered reading, so the line never
// claims more freshness than the stalest row has (CONTEXT.md → Read).
// A time is a query's `dataUpdatedAt`; 0 or undefined has not answered yet.
export function freshnessLine(
  readAt: readonly (number | undefined)[],
  now: Date,
): string | null {
  const answered = readAt.filter((time): time is number => (time ?? 0) > 0);
  if (answered.length === 0) {
    return null;
  }
  const since = ago(new Date(Math.min(...answered)).toISOString(), now);
  return since === null ? null : `Read ${since}`;
}
