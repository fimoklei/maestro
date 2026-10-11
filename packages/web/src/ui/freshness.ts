import type { HarnessFreshness } from "@maestro/core";
import { useNow } from "./use-now";

export const NOT_READ_YET = "Not read yet";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Fixed locale: the date must not change shape with the browser's.
const dayAndMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

// Null when the string is not a moment, so a hand-edited config reads as
// "never read" instead of throwing inside the date formatter (#516).
export const ago = (iso: string, now: Date): string | null => {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) {
    return null;
  }
  const elapsed = now.getTime() - at;
  if (elapsed < MINUTE) {
    return "just now";
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} min ago`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)} h ago`;
  }
  return `on ${dayAndMonth.format(new Date(iso))}`;
};

/** A reading's time: epoch ms or ISO string; 0, null or unparsable has not answered. */
type ReadTime = number | string | null | undefined;

export type Freshness = {
  readAt: readonly ReadTime[];
  // `null`: no read attempted yet. `untracked`: the screen's failed reads speak
  // through their own notices, so the line only dates what answered.
  outcome: HarnessFreshness["outcome"] | "untracked";
};

const toMs = (time: ReadTime): number =>
  typeof time === "string" ? Date.parse(time) : (time ?? 0);

// Dates the oldest answered reading, so the line never claims more freshness
// than the stalest row. `on 20 Jul` reads as a date, `4 min ago` as a
// distance; neither carries "Read", which its caller places.
export const oldestAgo = (
  readAt: Freshness["readAt"],
  now: Date,
): string | null => {
  const answered = readAt.map(toMs).filter((time) => time > 0);
  return answered.length === 0
    ? null
    : ago(new Date(Math.min(...answered)).toISOString(), now);
};

/** One reading behind the rows: when it last answered, in epoch ms (null: never), and whether its latest attempt failed. */
export type Reading = { at: number | null; failed: boolean };

/** A query's reading; its `dataUpdatedAt` stays 0 until it first answers. */
export const queryReading = (query: {
  dataUpdatedAt: number;
  isError: boolean;
}): Reading => ({
  at: query.dataUpdatedAt === 0 ? null : query.dataUpdatedAt,
  failed: query.isError,
});

/** The target reads' readings; an unreadable target is its row's Unknown, so it neither fails nor dates the screen (#1492). */
export const targetReadings = (
  queries: readonly Parameters<typeof queryReading>[0][],
): Reading[] => queries.filter((query) => !query.isError).map(queryReading);

// The oldest reading dates the line, and one that never answered is the
// oldest of all; a failed reading turns it into the failed-read words.
export const readFreshness = (reads: readonly Reading[]): Freshness => {
  const ats = reads.map((each) => each.at);
  return {
    readAt: ats.includes(null) ? [] : ats,
    outcome: reads.some((each) => each.failed) ? "fetch-failed" : "fetched",
  };
};

export const READ_FAILED = "Read failed";
export const OFFLINE = "Offline";
export const lastRead = (since: string) => `last read ${since}`;

export function freshnessLine(
  { readAt, outcome }: Freshness,
  now: Date,
): string | null {
  const since = oldestAgo(readAt, now);
  if (outcome === "untracked") {
    return since === null ? null : `Read ${since}`;
  }
  if (outcome === null) {
    return NOT_READ_YET;
  }
  if (outcome === "fetched") {
    return since === null ? NOT_READ_YET : `Read ${since}`;
  }
  // A failure never claims a verdict GitHub has not given: no permission gate,
  // no expired-token guess (#516).
  const cause = outcome === "offline" ? OFFLINE : READ_FAILED;
  return since === null
    ? `${cause} — never read`
    : `${cause} — ${lastRead(since)}`;
}

/** The freshness line, ticking with the clock; null input renders no line. */
export function useFreshnessLine(freshness: Freshness | null): string | null {
  const now = useNow();
  return freshness === null ? null : freshnessLine(freshness, now);
}
