import type { DriftStatus } from "../drift/drift-view-model";
import { targetReading } from "../inventory/skill-status";
import { reading, type StatusReading } from "../ui/status-reading";
import { NO_LONGER_RELEASED_HINT, UNREACHED_HINT } from "./deploy-state-copy";
import { copyChipText } from "./release-head-copy";
import { LOCAL_EDITS } from "./target-status";
import type { DeployedPrimitive } from "./use-deploy-state";

// The one mark a skill row in a target's pane carries (#993): a copy that can
// hold work outranks the drift reading, because it blocks the next step.
export type SkillMark = StatusReading & { hint?: string };

const COPY_MARKS = {
  "local-edits": LOCAL_EDITS,
  unverified: reading("Unverified", "unknown"),
} satisfies Record<NonNullable<DeployedPrimitive["copy"]>, StatusReading>;

const DRIFT_HINTS: Partial<Record<DriftStatus, string>> = {
  "no-longer-released": NO_LONGER_RELEASED_HINT,
  unverified: UNREACHED_HINT,
};

export function skillMark(
  copy: DeployedPrimitive["copy"],
  drift: DriftStatus,
): SkillMark | null {
  if (copy !== undefined) {
    return { ...COPY_MARKS[copy], hint: copyChipText(copy).hint };
  }
  const mark = targetReading(drift);
  const hint = DRIFT_HINTS[drift];
  return mark === null ? null : hint === undefined ? mark : { ...mark, hint };
}
