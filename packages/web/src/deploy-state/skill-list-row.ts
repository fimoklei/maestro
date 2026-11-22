import type { DeployedPrimitive } from "@maestro/core";
import { type DriftViewModel, lagsPin } from "../drift/drift-view-model";
import { UP_TO_DATE } from "../inventory/skill-status";
import type { Copy } from "../ui/phrase";
import { rankBy, type StatusReading } from "../ui/status-reading";
import type { SubListValue } from "../ui/sub-list-row";
import type { GlobalSkillReadings } from "./global-skill-readings";
import { SKILL_MARK_WORDS, SKILL_MARKS, skillMark } from "./skill-mark";

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
  hover: Copy | undefined;
  /** Lower is worse: the mark's place in the skill-row order. */
  rank: number;
  /** Up to date in every folder of its target. */
  clean: boolean;
};

const rankOf = rankBy(SKILL_MARK_WORDS);

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
    const mark = SKILL_MARKS[off.reading];
    return {
      ...row,
      mark,
      value: off.value,
      hover: off.hover,
      rank: rankOf(mark),
      clean: false,
    };
  });
}
