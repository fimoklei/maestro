import type { DeployedPrimitive } from "@maestro/core";
import {
  type KindOn,
  readingsOn,
  withUnknown,
} from "@maestro/core/reading-order";
import type { DriftStatus } from "../drift/drift-view-model";
import {
  BEHIND,
  driftKind,
  NO_LONGER_RELEASED,
  targetReading,
  UNKNOWN,
  UNVERIFIED,
  UP_TO_DATE,
} from "../inventory/skill-status";
import { WARNING_GLYPH } from "../ui/status-family";
import { reading, type StatusReading } from "../ui/status-reading";
import {
  NO_LONGER_RELEASED_HINT,
  TIMED_OUT_HINT,
  UNREACHED_HINT,
} from "./deploy-state-copy";
import { copyChipText } from "./release-head-copy";
import { EDITS_IN_HARNESS, LOCAL_EDITS, NOT_UPDATED } from "./target-status";

// The one mark a skill row in a target's pane carries (#993): the worse of
// its copy reading and its drift reading.
export type SkillMark = StatusReading & { hint?: string };

type SkillKind = KindOn<"skill"> | "unknown";

const SKILL_ORDER = withUnknown(readingsOn("skill"), "unverified");

/** Each mark a skill row can carry; Missing is a Global skill row without a copy in a written folder. */
export const SKILL_MARKS = {
  "local-edits": LOCAL_EDITS,
  missing: reading("Missing", "attention", WARNING_GLYPH),
  "not-updated": NOT_UPDATED,
  unverified: UNVERIFIED,
  unknown: UNKNOWN,
  "no-longer-released": NO_LONGER_RELEASED,
  "edits-in-harness": EDITS_IN_HARNESS,
  behind: BEHIND,
  "up-to-date": UP_TO_DATE,
} satisfies Record<SkillKind, StatusReading>;

export const SKILL_MARK_WORDS = SKILL_ORDER.map(
  (kind) => SKILL_MARKS[kind].word,
);

// No reading yet ranks below every mark.
const rankOf = (kind: SkillKind | null) =>
  kind === null ? SKILL_ORDER.length : SKILL_ORDER.indexOf(kind);

const DRIFT_HINTS: Partial<Record<DriftStatus, string>> = {
  "no-longer-released": NO_LONGER_RELEASED_HINT,
  unverified: UNREACHED_HINT,
  "timed-out": TIMED_OUT_HINT,
};

export function skillMark(
  copy: DeployedPrimitive["copy"],
  drift: DriftStatus,
): SkillMark | null {
  const kind = driftKind(drift);
  if (copy !== undefined && rankOf(copy) <= rankOf(kind)) {
    return { ...SKILL_MARKS[copy], hint: copyChipText(copy).hint };
  }
  const mark = targetReading(drift);
  const hint = DRIFT_HINTS[drift];
  return mark === null ? null : hint === undefined ? mark : { ...mark, hint };
}
