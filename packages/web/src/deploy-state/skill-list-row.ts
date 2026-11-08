import type { DeployedPrimitive } from "@maestro/core";
import { type DriftViewModel, lagsPin } from "../drift/drift-view-model";
import {
  BEHIND,
  NO_LONGER_RELEASED,
  UNKNOWN,
  UNVERIFIED,
  UP_TO_DATE,
} from "../inventory/skill-status";
import { plainText } from "../ui/phrase";
import { WARNING_GLYPH } from "../ui/status-family";
import { reading, type StatusReading } from "../ui/status-reading";
import type { SubListValue } from "../ui/sub-list-row";
import { FOLDER_READINGS, type FolderSkillReading } from "./folder-reading";
import type { GlobalSkillReadings } from "./global-skill-readings";
import { skillMark } from "./skill-mark";
import { LOCAL_EDITS, NOT_UPDATED } from "./target-status";

/** A Global skill row that has no copy in one of the written folders. */
const MISSING = reading("Missing", "attention", WARNING_GLYPH);

/**
 * One row of a target's Deployed skills, whichever target it comes from: the
 * list renders it and computes nothing.
 */
export type SkillListRow = {
  primitive: DeployedPrimitive;
  /** Null while the reading has not answered. */
  mark: StatusReading | null;
  /** A version or path as a machine value; a folder count in words. */
  value: SubListValue;
  /** The mark's tooltip line under its word. */
  hover: string | undefined;
  /** Lower is worse: the mark's place in the skill-row order. */
  rank: number;
  /** Up to date in every folder of its target. */
  clean: boolean;
};

const FOLDER_MARKS = {
  "local-edits": LOCAL_EDITS,
  missing: MISSING,
  "not-updated": NOT_UPDATED,
} satisfies Record<FolderSkillReading, StatusReading>;

// Worst first. Unknown sits with Unverified: neither proves the skill fine.
const RANKED = [
  ...FOLDER_READINGS.map((each) => FOLDER_MARKS[each]),
  UNVERIFIED,
  UNKNOWN,
  NO_LONGER_RELEASED,
  BEHIND,
  UP_TO_DATE,
].map((each) => each.word);

const rankOf = (mark: StatusReading | null) => {
  const index = mark === null ? -1 : RANKED.indexOf(mark.word);
  return index === -1 ? RANKED.length : index;
};

/** A repository's rows, and Global's where no copy deviates: the shipped skill mark. */
export function repoSkillRows(
  primitives: readonly DeployedPrimitive[],
  drift: DriftViewModel,
): SkillListRow[] {
  return primitives.map((primitive) => {
    const status = drift.skillStatus(primitive.name);
    const latest = drift.latest(primitive.name);
    const mark = skillMark(primitive.copy, status);
    return {
      primitive,
      mark,
      value: {
        text:
          lagsPin(status) && latest
            ? `${primitive.version} → ${latest}`
            : primitive.version,
        machine: true,
      },
      hover: mark?.hint,
      rank: rankOf(mark),
      clean: mark?.word === UP_TO_DATE.word,
    };
  });
}

/** Global's rows: a skill that deviates in a written folder reads its worst folder reading. */
export function globalSkillRows(
  primitives: readonly DeployedPrimitive[],
  drift: DriftViewModel,
  table: GlobalSkillReadings,
): SkillListRow[] {
  return repoSkillRows(primitives, drift).map((row) => {
    const off = table.deviating.find(
      (each) => each.skill === row.primitive.name,
    );
    if (off === undefined) return row;
    const mark = FOLDER_MARKS[off.reading];
    return {
      ...row,
      mark,
      value: off.value,
      hover: plainText(off.hover),
      rank: rankOf(mark),
      clean: false,
    };
  });
}
