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

/** Sort key: a lower number is a worse reading. */
export const readingRank = (value: StatusReading): number =>
  RANK.indexOf(value.family);

/** A Status column's width, in spacing steps, that fits "Edits in the Harness". */
export const STATUS_COLUMN_WIDTH = 41;
