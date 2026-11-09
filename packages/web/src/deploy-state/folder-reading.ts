/**
 * How a copy in a Global folder deviates, worst first: a copy that holds work
 * outranks one that is absent or behind. The skill marks, the folder words
 * and the target roll-up all take this order.
 */
export const FOLDER_READINGS = [
  "local-edits",
  "missing",
  "not-updated",
] as const;

export type FolderSkillReading = (typeof FOLDER_READINGS)[number];
