// Feature code passes a family, never a colour.

export type StatusFamily =
  | "good"
  | "attention"
  | "failed"
  | "unknown"
  | "neutral";

type StatusTokens = {
  glyph: string;
  /** Status text: a label, legend or sentence. */
  ink: string;
  /** A glyph beside status text. */
  mark: string;
  dot: string;
  fill: string;
  edge: string;
  /** The badge's half-strength border. */
  softEdge: string;
};

// Literal class names: Tailwind finds only what it can read in the source.
export const STATUS_TOKENS: Record<StatusFamily, StatusTokens> = {
  good: {
    glyph: "✓",
    ink: "text-green-12",
    mark: "text-green-11",
    dot: "bg-green-11",
    fill: "bg-green-3",
    edge: "border-green-7",
    softEdge: "border-green-7/50",
  },
  attention: {
    glyph: "↑",
    ink: "text-amber-12",
    mark: "text-amber-11",
    dot: "bg-amber-11",
    fill: "bg-amber-3",
    edge: "border-amber-7",
    softEdge: "border-amber-7/50",
  },
  failed: {
    glyph: "✕",
    ink: "text-red-12",
    mark: "text-red-11",
    dot: "bg-red-11",
    fill: "bg-red-3",
    edge: "border-red-7",
    softEdge: "border-red-7/50",
  },
  unknown: {
    glyph: "?",
    ink: "text-gray-11",
    mark: "text-gray-11",
    dot: "bg-gray-11",
    fill: "bg-gray-3",
    edge: "border-gray-7",
    softEdge: "border-gray-7/50",
  },
  neutral: {
    glyph: "–",
    ink: "text-gray-11",
    mark: "text-gray-11",
    dot: "bg-gray-11",
    fill: "bg-gray-3",
    edge: "border-gray-7",
    softEdge: "border-gray-7/50",
  },
};

/** Attention's second glyph, for a warning rather than a lag. */
export const WARNING_GLYPH = "⚠";

type ListTokens = {
  glyph: string;
  edge: string;
  fill: string;
  sentence: string;
};

const calmRow = (family: StatusFamily): ListTokens => ({
  glyph: STATUS_TOKENS[family].glyph,
  edge: "border-edge",
  fill: "",
  sentence: "text-gray-11",
});

const markedRow = (family: StatusFamily): ListTokens => ({
  ...calmRow(family),
  edge: STATUS_TOKENS[family].edge,
  fill: STATUS_TOKENS[family].fill,
});

/** A dialog list's group and row per family: calm families stay unfilled, and a row's own cost is a warning, never a lag. */
export const LIST_TOKENS: Record<StatusFamily, ListTokens> = {
  good: markedRow("good"),
  attention: {
    ...markedRow("attention"),
    glyph: WARNING_GLYPH,
    sentence: STATUS_TOKENS.attention.ink,
  },
  failed: markedRow("failed"),
  unknown: calmRow("unknown"),
  neutral: calmRow("neutral"),
};
