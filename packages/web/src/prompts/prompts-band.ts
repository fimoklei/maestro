// Band 2 widths in rem: the labels go first, then Origin, Release and
// Prompts, then the search becomes an icon; the read age never drops.
export const LABELS_BELOW_REM = 56;
export const ORIGIN_DROP = { rank: 1, belowRem: 50 } as const;
export const RELEASED_DROP = { rank: 2, belowRem: 34 } as const;
export const PROMPTS_DROP = { rank: 3, belowRem: 28 } as const;
export const SEARCH_ICON_BELOW_REM = 28;
// No counts on a table without a Status column.
export const COUNTS_BELOW_REM = 0;
