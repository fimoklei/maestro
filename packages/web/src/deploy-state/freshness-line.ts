import { ago } from "../harness/harness-view-model";

// The oldest answered reading, so the line never claims more freshness than the
// stalest row. A time of 0 or undefined has not answered yet.
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
