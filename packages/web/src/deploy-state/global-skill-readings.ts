import type { GlobalFolderState } from "@maestro/core";
import type { Copy } from "../ui/phrase";
import type { SubListValue } from "../ui/sub-list-row";
import {
  deviatingFoldersValue,
  inFoldersHint,
  noCopyInHint,
  notUpdatedLine,
} from "./deploy-state-copy";
import { FOLDER_READINGS, type FolderSkillReading } from "./folder-reading";

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

/** A skill whose copies deviate in at least one written folder. */
type DeviatingSkill = {
  skill: string;
  /** Its worst reading across the written folders. */
  reading: FolderSkillReading;
  /** The row's value in place of the version. */
  value: SubListValue;
  hover: Copy;
};

export type GlobalSkillReadings = {
  /** One reading per skill per written folder, skill by skill. */
  readings: SkillFolderReading[];
  /** Each written folder with its counts, in folder order. */
  folders: { path: string; counts: FolderCounts }[];
  /** Each skill that deviates somewhere, in skill order. */
  deviating: DeviatingSkill[];
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

function oneFolderHover(
  reading: FolderSkillReading,
  folder: GlobalFolderState,
  skill: string,
  release: string | undefined,
): Copy {
  const copy = folder.notUpdated?.find((each) => each.name === skill);
  if (reading === "missing") return noCopyInHint(folder.path);
  if (reading === "not-updated" && copy !== undefined && release !== undefined)
    return notUpdatedLine(folder.path, [copy], release);
  return inFoldersHint([folder.path]);
}

/**
 * Global's skill × folder table: `skills` is Global's one skill list and
 * `release` its Target release. A folder whose tool is not detected never
 * enters it, so it counts nowhere.
 */
export function globalSkillReadings(
  skills: readonly string[],
  folders: readonly GlobalFolderState[],
  release: string | undefined,
): GlobalSkillReadings {
  const written = folders.filter((folder) => folder.detected);
  const readings = skills.flatMap((skill) =>
    written.map((folder) => ({
      skill,
      folder: folder.path,
      reading: readingIn(folder, skill),
    })),
  );
  const deviating = skills.flatMap((skill): DeviatingSkill[] => {
    const off = written.flatMap((folder) => {
      const reading = readingIn(folder, skill);
      return reading === null ? [] : [{ folder, reading }];
    });
    const reading = FOLDER_READINGS.find((each) =>
      off.some((one) => one.reading === each),
    );
    const [only] = off;
    if (reading === undefined || only === undefined) return [];
    const paths = off.map((one) => one.folder.path);
    return [
      {
        skill,
        reading,
        value: deviatingFoldersValue(paths, written.length),
        hover:
          off.length === 1
            ? oneFolderHover(reading, only.folder, skill, release)
            : inFoldersHint(paths),
      },
    ];
  });
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
    deviating,
  };
}
