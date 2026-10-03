import type { HarnessFreshness } from "@maestro/core";
import { useNow } from "./use-now";

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
export type ReadTime = number | string | null | undefined;

export type Freshness = {
  readAt: readonly ReadTime[];
  // `null`: no read attempted yet. `untracked`: the screen's failed reads speak
  // through their own notices, so the line only dates what answered.
  outcome: HarnessFreshness["outcome"] | "untracked";
  reading: boolean;
};

const toMs = (time: ReadTime): number =>
  typeof time === "string" ? Date.parse(time) : (time ?? 0);

// Dates the oldest answered reading, so the line never claims more freshness
// than the stalest row. `on 20 Jul` reads as a date, `4 min ago` as a
// distance; both follow "Read", so the prefix is not repeated.
export function freshnessLine(
  { readAt, outcome, reading }: Freshness,
  now: Date,
): string | null {
  // A read in flight outranks every dated reading: this slot is the only
  // feedback the author gets while one runs.
  if (reading) {
    return "Reading GitHub…";
  }
  const answered = readAt.map(toMs).filter((time) => time > 0);
  const since =
    answered.length === 0
      ? null
      : ago(new Date(Math.min(...answered)).toISOString(), now);
  if (outcome === "untracked") {
    return since === null ? null : `Read ${since}`;
  }
  if (outcome === null) {
    return "Not read yet";
  }
  if (outcome === "fetched") {
    return since === null ? "Not read yet" : `Read ${since}`;
  }
  // A failure never claims a verdict GitHub has not given: no permission gate,
  // no expired-token guess (#516).
  const cause = outcome === "offline" ? "Offline" : "Read failed";
  return since === null
    ? `${cause} — never read`
    : `${cause} — last read ${since}`;
}

/** The freshness line, ticking with the clock; null input renders no line. */
export function useFreshnessLine(freshness: Freshness | null): string | null {
  const now = useNow();
  return freshness === null ? null : freshnessLine(freshness, now);
}
