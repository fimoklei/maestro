import {
  type KindOn,
  readingsOn,
  withUnknown,
} from "@maestro/core/reading-order";
import {
  chipOf,
  EDITS_IN_HARNESS,
  LOCAL_EDITS,
} from "../deploy-state/target-status";
import type { DriftStatus } from "../drift/drift-view-model";
import type { StatusChip } from "../ui/band-summary";
import { WARNING_GLYPH } from "../ui/status-family";
import { rankBy, reading, type StatusReading } from "../ui/status-reading";
import type { DeployedRollup } from "./deployed-rollup";
import type { SkillDeployment } from "./skill-deployments";

// One skill's worst reading across its targets.
export const UP_TO_DATE = reading("Up to date", "good");
export const BEHIND = reading("Behind", "attention");
export const UNKNOWN = reading("Unknown", "unknown");
const NOT_DEPLOYED = reading("Not deployed", "neutral");

type InventoryKind = KindOn<"inventory"> | "unknown";

const INVENTORY_ORDER = withUnknown(readingsOn("inventory"), "behind");

const INVENTORY_READINGS = {
  "local-edits": LOCAL_EDITS,
  "edits-in-harness": EDITS_IN_HARNESS,
  behind: BEHIND,
  unknown: UNKNOWN,
  "up-to-date": UP_TO_DATE,
  "not-deployed": NOT_DEPLOYED,
} satisfies Record<InventoryKind, StatusReading>;

/** Every word the Skills Status column reads, worst first, as Filter offers them. */
export const INVENTORY_STATUS_WORDS = INVENTORY_ORDER.map(
  (kind) => INVENTORY_READINGS[kind].word,
);

/** Band 2's count chips: Unknown, then each reading above it, worst first. */
export const SKILL_CHIPS: readonly StatusChip[] = [
  { word: UNKNOWN.word, family: "failed", covers: [UNKNOWN.word] },
  ...INVENTORY_ORDER.slice(0, INVENTORY_ORDER.indexOf("unknown")).map((kind) =>
    chipOf(INVENTORY_READINGS[kind], [INVENTORY_READINGS[kind].word]),
  ),
];

// Null until every read and check has answered: zero reach is not yet "nowhere".
function inventoryKind(rollup: DeployedRollup): InventoryKind | null {
  const {
    targetCount,
    behindCount,
    unknownCount,
    localEditsCount,
    editsInHarnessCount,
  } = rollup;
  if (rollup.pending || rollup.checking) {
    return null;
  }
  const holds = {
    "local-edits": localEditsCount > 0,
    "edits-in-harness": editsInHarnessCount > 0,
    behind: behindCount > 0,
    unknown: unknownCount > 0 || rollup.unreadable === true,
    "up-to-date":
      targetCount >
      behindCount + unknownCount + localEditsCount + editsInHarnessCount,
    "not-deployed": true,
  } satisfies Record<InventoryKind, boolean>;
  return INVENTORY_ORDER.find((kind) => holds[kind]) ?? "not-deployed";
}

export function skillStatus(rollup: DeployedRollup): StatusReading | null {
  const kind = inventoryKind(rollup);
  return kind === null ? null : INVENTORY_READINGS[kind];
}

/** A Status column's sort key. */
export const inventoryRank = rankBy(INVENTORY_STATUS_WORDS);

export const UNVERIFIED = reading("Unverified", "unknown");
export const NO_LONGER_RELEASED = reading(
  "No longer released",
  "attention",
  WARNING_GLYPH,
);

type DriftKind = Extract<
  KindOn<"skill"> | "unknown",
  "up-to-date" | "behind" | "no-longer-released" | "unknown" | "unverified"
>;

const DRIFT_READINGS = {
  "up-to-date": UP_TO_DATE,
  behind: BEHIND,
  "no-longer-released": NO_LONGER_RELEASED,
  unknown: UNKNOWN,
  unverified: UNVERIFIED,
} satisfies Record<DriftKind, StatusReading>;

/** One target's own reading kind. Null while its check runs. */
export function driftKind(status: DriftStatus): DriftKind | null {
  switch (status) {
    case "up-to-date":
    case "older-tag":
      return "up-to-date";
    case "behind":
      return "behind";
    case "no-longer-released":
      return "no-longer-released";
    case "unknown":
    case "timed-out":
      return "unknown";
    case "unverified":
      return "unverified";
    case "pending":
      return null;
  }
}

// One target's own reading. Null while its check runs.
export function targetReading(status: DriftStatus): StatusReading | null {
  const kind = driftKind(status);
  return kind === null ? null : DRIFT_READINGS[kind];
}

export type SkillState =
  | { kind: "local-edits"; count: number; total: number }
  | { kind: "edits-in-harness"; count: number; total: number }
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
  const kind = inventoryKind(rollup);
  if (kind === null || total === 0) return null;
  switch (kind) {
    case "local-edits":
      return { kind, count: rollup.localEditsCount, total };
    case "edits-in-harness":
      return { kind, count: rollup.editsInHarnessCount, total };
    case "behind": {
      // The roll-up counts an edited copy as Local edits, never as behind.
      const behind = deployments.filter(
        (deployment) => deployment.status === "behind" && !deployment.edited,
      );
      const releases = new Set(behind.map((deployment) => deployment.release));
      return {
        kind,
        count: rollup.behindCount,
        total,
        from: releases.size === 1 ? ([...releases][0] ?? null) : null,
        to: latestRelease ?? null,
        updatable: behind.some((deployment) => deployment.updatable),
      };
    }
    // The list's own line says a target was not read.
    case "unknown":
      return rollup.unknownCount > 0 ? { kind } : null;
    case "up-to-date":
      return { kind };
    case "not-deployed":
      return null;
  }
}
