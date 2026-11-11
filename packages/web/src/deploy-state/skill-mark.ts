import type { DeployedPrimitive } from "@maestro/core";
import type { DriftStatus } from "../drift/drift-view-model";
import { BEHIND, targetReading, UP_TO_DATE } from "../inventory/skill-status";
import { reading, type StatusReading } from "../ui/status-reading";
import {
  NO_LONGER_RELEASED_HINT,
  TIMED_OUT_HINT,
  UNREACHED_HINT,
} from "./deploy-state-copy";
import { copyChipText } from "./release-head-copy";
import { EDITS_IN_HARNESS, LOCAL_EDITS } from "./target-status";

// The one mark a skill row in a target's pane carries (#993): a copy that can
// hold work outranks the drift reading, because it blocks the next step.
export type SkillMark = StatusReading & { hint?: string };

const COPY_MARKS = {
  "local-edits": LOCAL_EDITS,
  "edits-in-harness": EDITS_IN_HARNESS,
  unverified: reading("Unverified", "unknown"),
} satisfies Record<NonNullable<DeployedPrimitive["copy"]>, StatusReading>;

const DRIFT_HINTS: Partial<Record<DriftStatus, string>> = {
  "no-longer-released": NO_LONGER_RELEASED_HINT,
  unverified: UNREACHED_HINT,
  "timed-out": TIMED_OUT_HINT,
};

// Edits in the Harness ranks below every drift mark but Behind and Up to date.
const BELOW_HELD_EDITS: readonly (string | undefined)[] = [
  BEHIND.word,
  UP_TO_DATE.word,
  undefined,
];

export function skillMark(
  copy: DeployedPrimitive["copy"],
  drift: DriftStatus,
): SkillMark | null {
  const mark = targetReading(drift);
  if (
    copy !== undefined &&
    (copy !== "edits-in-harness" || BELOW_HELD_EDITS.includes(mark?.word))
  ) {
    return { ...COPY_MARKS[copy], hint: copyChipText(copy).hint };
  }
  const hint = DRIFT_HINTS[drift];
  return mark === null ? null : hint === undefined ? mark : { ...mark, hint };
}
