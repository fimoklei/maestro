// The sidebar counters' words (#1115).
export const behindCount = (count: number): string => `${count} behind`;

/** A failed read: `?` on screen, the word for a screen reader. */
export const UNKNOWN_COUNT = { shown: "?", spoken: "Unknown" } as const;
