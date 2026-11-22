import { type KindOn, readingsOn } from "@maestro/core/reading-order";

/**
 * How a copy in a Global folder deviates, worst first. The skill marks, the
 * folder words and the target roll-up all take this order.
 */
export const FOLDER_READINGS = readingsOn("folder");

export type FolderSkillReading = KindOn<"folder">;
