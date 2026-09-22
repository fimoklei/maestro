import type { DriftStatus } from "../drift/drift-view-model";
import {
  reading,
  type StatusReading,
  worstReading,
} from "../ui/status-reading";
import type { DeployedRollup } from "./deployed-rollup";

// One skill's worst reading across its targets; words from CONTEXT.md.
export const UP_TO_DATE = reading("Up to date", "good");
export const BEHIND = reading("Behind", "attention");
export const UNKNOWN = reading("Unknown", "unknown");
export const NOT_DEPLOYED = reading("Not deployed", "neutral");

// Null until every read and check has answered: no status shows before the
// server confirms it (ADR-0033 §10), and zero reach is not yet "nowhere" (J04).
export function skillStatus(rollup: DeployedRollup): StatusReading | null {
  const { targetCount, behindCount, unknownCount } = rollup;
  if (rollup.pending || rollup.checking) {
    return null;
  }
  const readings: StatusReading[] = [];
  if (behindCount > 0) readings.push(BEHIND);
  if (unknownCount > 0 || rollup.unreadable) readings.push(UNKNOWN);
  if (targetCount > behindCount + unknownCount) readings.push(UP_TO_DATE);
  return worstReading(readings) ?? NOT_DEPLOYED;
}

const UNVERIFIED = reading("Unverified", "unknown");
const NO_LONGER_RELEASED = reading("No longer released", "attention", "⚠");

// One target's own reading. Null while its check runs: no status before the
// server answers (ADR-0033 §10).
export function targetReading(status: DriftStatus): StatusReading | null {
  switch (status) {
    case "up-to-date":
    case "older-tag":
      return UP_TO_DATE;
    case "behind":
      return BEHIND;
    case "no-longer-released":
      return NO_LONGER_RELEASED;
    case "unknown":
      return UNKNOWN;
    case "unverified":
      return UNVERIFIED;
    case "pending":
      return null;
  }
}
