import {
  type Freshness,
  lastRead,
  NOT_READ_YET,
  OFFLINE,
  oldestAgo,
  READ_FAILED,
} from "./freshness";
import type { StatusFamily } from "./status-family";

/** A count the operator can act on; a screen passes every one, zeros included. */
export type BandCount = {
  word: string;
  count: number;
  family: "failed" | "attention";
  /** Present only where the screen has a status filter. */
  filter?: { pressed: boolean; onToggle: () => void };
};

/** A count chip a screen offers: its word, family, and the status words it covers. */
export type StatusChip = Pick<BandCount, "word" | "family"> & {
  covers: readonly string[];
};

/** What a screen states for band 2's summary: its reading, healthy word and counts, worst first. */
export type BandSummaryInput = {
  freshness: Freshness;
  healthy: string;
  counts: readonly BandCount[];
};

/** The dot's family, its word (null while counts speak), the counts to show and the read age. */
export type BandSummaryReading = {
  family: StatusFamily;
  word: string | null;
  counts: readonly BandCount[];
  age: string | null;
};

/** Counts the values that read one of `words`. */
export const countOf = (
  values: readonly (string | null | undefined)[],
  ...words: readonly string[]
) => values.filter((value) => value != null && words.includes(value)).length;

// The worst state on the screen, first match wins (spec #1492).
export function bandSummary(
  { freshness, healthy, counts }: BandSummaryInput,
  now: Date,
): BandSummaryReading {
  const since = oldestAgo(freshness.readAt, now);
  const { outcome } = freshness;
  // A pressed chip stays, so the band can always unpress it (US17).
  const pressed = counts.filter((each) => each.filter?.pressed === true);
  if (outcome === "fetch-failed" || outcome === "offline") {
    return {
      family: "failed",
      word: outcome === "offline" ? OFFLINE : READ_FAILED,
      counts: pressed,
      age: since === null ? null : lastRead(since),
    };
  }
  if (outcome === null || since === null) {
    return {
      family: "unknown",
      word: NOT_READ_YET,
      counts: pressed,
      age: null,
    };
  }
  const shown = counts.filter(
    (each) => each.count > 0 || each.filter?.pressed === true,
  );
  if (shown.every((each) => each.count === 0)) {
    return { family: "good", word: healthy, counts: shown, age: since };
  }
  const family = shown.some(
    (each) => each.count > 0 && each.family === "failed",
  )
    ? "failed"
    : "attention";
  return { family, word: null, counts: shown, age: since };
}
