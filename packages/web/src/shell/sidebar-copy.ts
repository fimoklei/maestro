export const behindCount = (count: number): string => `${count} behind`;
export const pendingCount = (count: number): string => `${count} pending`;

/** A failed read: `?` on screen, the word for a screen reader. */
export const UNKNOWN_COUNT = { shown: "?", spoken: "Unknown" } as const;
