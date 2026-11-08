import type { GlobalFolderState } from "@maestro/core";

/** How one skill's copy in one Global folder deviates; null where it does not. */
type FolderSkillReading = "local-edits" | "missing" | "not-updated";

type SkillFolderReading = {
  skill: string;
  folder: string;
  reading: FolderSkillReading | null;
};

/** A folder's count of skills per reading, in the folder meta line's order. */
export type FolderCounts = {
  missing: number;
  notUpdated: number;
  localEdits: number;
};

export type GlobalSkillReadings = {
  /** One reading per skill per written folder, skill by skill. */
  readings: SkillFolderReading[];
  /** Each written folder with its counts, in folder order. */
  folders: { path: string; counts: FolderCounts }[];
};

function readingIn(
  folder: GlobalFolderState,
  skill: string,
): FolderSkillReading | null {
  if (folder.missing?.includes(skill)) return "missing";
  const copy = folder.primitives.find((each) => each.name === skill);
  if (copy?.copy === "local-edits") return "local-edits";
  if (folder.notUpdated?.some((each) => each.name === skill)) {
    return "not-updated";
  }
  return null;
}

const COUNTED = {
  missing: "missing",
  "not-updated": "notUpdated",
  "local-edits": "localEdits",
} satisfies Record<FolderSkillReading, keyof FolderCounts>;

/**
 * Global's skill × folder table: `skills` is Global's one skill list. A folder
 * whose tool is not detected never enters it, so it counts nowhere.
 */
export function globalSkillReadings(
  skills: readonly string[],
  folders: readonly GlobalFolderState[],
): GlobalSkillReadings {
  const written = folders.filter((folder) => folder.detected);
  const readings = skills.flatMap((skill) =>
    written.map((folder) => ({
      skill,
      folder: folder.path,
      reading: readingIn(folder, skill),
    })),
  );
  return {
    readings,
    folders: written.map((folder) => {
      const counts: FolderCounts = { missing: 0, notUpdated: 0, localEdits: 0 };
      for (const each of readings) {
        if (each.folder === folder.path && each.reading !== null) {
          counts[COUNTED[each.reading]] += 1;
        }
      }
      return { path: folder.path, counts };
    }),
  };
}
