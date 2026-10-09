// A status is a word, then a glyph, then a colour.

import {
  STATUS_TOKENS,
  type StatusFamily,
  type WARNING_GLYPH,
} from "./status-family";

export type StatusReading = {
  word: string;
  family: StatusFamily;
  glyph: string;
};

// Worst first. Unknown outranks good, so "could not tell" never reads as fine.
const RANK: readonly StatusFamily[] = [
  "failed",
  "attention",
  "unknown",
  "good",
  "neutral",
];

export function reading(
  word: string,
  family: StatusFamily,
  /** Attention's warning glyph in place of the family's own; no other. */
  glyph?: typeof WARNING_GLYPH,
): StatusReading {
  return { word, family, glyph: glyph ?? STATUS_TOKENS[family].glyph };
}

export function worstReading(
  readings: readonly StatusReading[],
): StatusReading | undefined {
  let worst: StatusReading | undefined;
  for (const candidate of readings) {
    if (
      worst === undefined ||
      RANK.indexOf(candidate.family) < RANK.indexOf(worst.family)
    ) {
      worst = candidate;
    }
  }
  return worst;
}

/** Sort key: a lower number is a worse reading. */
export const readingRank = (value: StatusReading): number =>
  RANK.indexOf(value.family);
