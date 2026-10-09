import { LOCAL_EDITS } from "../deploy-state/target-status";
import type { DriftStatus } from "../drift/drift-view-model";
import { WARNING_GLYPH } from "../ui/status-family";
import {
  reading,
  type StatusReading,
  worstReading,
} from "../ui/status-reading";
import type { DeployedRollup } from "./deployed-rollup";
import type { SkillDeployment } from "./skill-deployments";

// One skill's worst reading across its targets.
export const UP_TO_DATE = reading("Up to date", "good");
export const BEHIND = reading("Behind", "attention");
export const UNKNOWN = reading("Unknown", "unknown");
export const NOT_DEPLOYED = reading("Not deployed", "neutral");

// Null until every read and check has answered: zero reach is not yet "nowhere".
export function skillStatus(rollup: DeployedRollup): StatusReading | null {
  const { targetCount, behindCount, unknownCount, localEditsCount } = rollup;
  if (rollup.pending || rollup.checking) {
    return null;
  }
  const readings: StatusReading[] = [];
  // Pushed before Behind: of two Attention readings the first one wins.
  if (localEditsCount > 0) readings.push(LOCAL_EDITS);
  if (behindCount > 0) readings.push(BEHIND);
  if (unknownCount > 0 || rollup.unreadable) readings.push(UNKNOWN);
  if (targetCount > behindCount + unknownCount + localEditsCount) {
    readings.push(UP_TO_DATE);
  }
  return worstReading(readings) ?? NOT_DEPLOYED;
}

const UNVERIFIED = reading("Unverified", "unknown");
const NO_LONGER_RELEASED = reading(
  "No longer released",
  "attention",
  WARNING_GLYPH,
);

// One target's own reading. Null while its check runs.
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

export type SkillState =
  | { kind: "local-edits"; count: number; total: number }
  | {
      kind: "behind";
      count: number;
      total: number;
      /** The one release the behind targets follow; null where they differ. */
      from: string | null;
      /** Where Update target moves them; null where the release is not read. */
      to: string | null;
      updatable: boolean;
    }
  | { kind: "unknown" }
  | { kind: "up-to-date" };

// The state the pane's sentence explains, in skillStatus's order. Null where
// the badge shows nothing, or nothing is deployed.
export function skillState(
  rollup: DeployedRollup,
  deployments: readonly SkillDeployment[],
  latestRelease: string | null | undefined,
): SkillState | null {
  const total = rollup.targetCount;
  if (skillStatus(rollup) === null || total === 0) return null;
  if (rollup.localEditsCount > 0) {
    return { kind: "local-edits", count: rollup.localEditsCount, total };
  }
  if (rollup.behindCount > 0) {
    // The roll-up counts an edited copy as Local edits, never as behind.
    const behind = deployments.filter(
      (deployment) => deployment.status === "behind" && !deployment.edited,
    );
    const releases = new Set(behind.map((deployment) => deployment.release));
    return {
      kind: "behind",
      count: rollup.behindCount,
      total,
      from: releases.size === 1 ? ([...releases][0] ?? null) : null,
      to: latestRelease ?? null,
      updatable: behind.some((deployment) => deployment.updatable),
    };
  }
  if (rollup.unknownCount > 0) return { kind: "unknown" };
  // The list's own line says a target was not read.
  return rollup.unreadable ? null : { kind: "up-to-date" };
}
