// A status is a word, then a glyph, then a colour.

export type StatusFamily =
  | "good"
  | "attention"
  | "failed"
  | "unknown"
  | "neutral";

export type StatusReading = {
  word: string;
  family: StatusFamily;
  glyph: string;
};

// Attention also has ⚠, for a reading that is a warning rather than a lag.
const GLYPHS: Record<StatusFamily, string> = {
  good: "✓",
  attention: "↑",
  failed: "✕",
  unknown: "?",
  neutral: "–",
};

// Worst first. Unknown outranks good, so "could not tell" never reads as fine.
const RANK: readonly StatusFamily[] = [
  "failed",
  "attention",
  "unknown",
  "good",
  "neutral",
];

export const glyphFor = (family: StatusFamily): string => GLYPHS[family];

export function reading(
  word: string,
  family: StatusFamily,
  glyph: string = GLYPHS[family],
): StatusReading {
  return { word, family, glyph };
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
