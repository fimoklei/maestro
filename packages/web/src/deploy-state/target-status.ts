import type { PendingOperation } from "@maestro/core";
import {
  type KindOn,
  readingsOn,
  withUnknown,
} from "@maestro/core/reading-order";
import type { TargetDriftIndicator } from "../drift/drift-view-model";
import type { StatusChip } from "../ui/band-summary";
import { WARNING_GLYPH } from "../ui/status-family";
import { rankBy, reading, type StatusReading } from "../ui/status-reading";
import type { FolderSkillReading } from "./folder-reading";
import { UNFINISHED_HEADINGS } from "./release-head-copy";

/** An unfinished operation's badge: its pane notice's own heading. */
export const unfinishedReading = (kind: PendingOperation["kind"]) =>
  reading(UNFINISHED_HEADINGS[kind], "attention", WARNING_GLYPH);
const ATTENTION = reading("Attention", "attention", WARNING_GLYPH);
export const SKILLS_MISSING = reading(
  "Skills missing",
  "attention",
  WARNING_GLYPH,
);
export const NOT_UPDATED = reading("Not updated", "attention", WARNING_GLYPH);
export const LOCAL_EDITS = reading("Local edits", "attention", WARNING_GLYPH);
export const BEHIND = reading("Behind", "attention");
export const EDITS_IN_HARNESS = reading("Edits in the Harness", "neutral");
const UNKNOWN = reading("Unknown", "unknown");
export const IN_SYNC = reading("In sync", "good");
const PINNED = reading("Pinned per skill", "neutral");
const OTHER_ORIGIN = reading("Other origin", "neutral");
const EMPTY = reading("Empty", "neutral");

type TargetKind = KindOn<"target"> | "unknown";

const TARGET_ORDER = withUnknown(readingsOn("target"), "behind");

// An unfinished operation reads its own notice's heading.
const TARGET_READINGS = {
  attention: ATTENTION,
  "local-edits": LOCAL_EDITS,
  missing: SKILLS_MISSING,
  "not-updated": NOT_UPDATED,
  "edits-in-harness": EDITS_IN_HARNESS,
  behind: BEHIND,
  unknown: UNKNOWN,
  "up-to-date": IN_SYNC,
  "pinned-per-skill": PINNED,
  "other-origin": OTHER_ORIGIN,
  empty: EMPTY,
} satisfies Record<Exclude<TargetKind, "unfinished">, StatusReading>;

/** Every word the badge can read, worst first, as Filter offers them. */
export const TARGET_STATUS_WORDS = TARGET_ORDER.flatMap((kind) =>
  kind === "unfinished"
    ? Object.values(UNFINISHED_HEADINGS)
    : [TARGET_READINGS[kind].word],
);

/** A Status column's sort key. */
export const targetRank = rankBy(TARGET_STATUS_WORDS);

/**
 * Global's one Status: the reading of its worst Global folder, by the Filter
 * order. Null while any folder has no reading yet.
 */
export function worstFolderReading(
  readings: readonly (StatusReading | null)[],
): StatusReading | null {
  let worst: StatusReading | null = null;
  for (const candidate of readings) {
    if (candidate === null) return null;
    if (
      worst === null ||
      TARGET_STATUS_WORDS.indexOf(candidate.word) <
        TARGET_STATUS_WORDS.indexOf(worst.word)
    ) {
      worst = candidate;
    }
  }
  return worst;
}

/** A count chip for a reading ranked above Unknown: a neutral one stays neutral. */
export const chipOf = (
  { word, family }: StatusReading,
  covers: readonly string[],
): StatusChip => ({
  word,
  family: family === "neutral" ? "neutral" : "attention",
  covers,
});

/** Band 2's count chips: Unknown, then each reading above it, worst first; the unfinished operations roll into Attention. */
export const TARGET_CHIPS: readonly StatusChip[] = [
  { word: UNKNOWN.word, family: "failed", covers: [UNKNOWN.word] },
  ...TARGET_ORDER.slice(0, TARGET_ORDER.indexOf("unknown")).flatMap(
    (kind): StatusChip[] => {
      if (kind === "unfinished") return [];
      const each = TARGET_READINGS[kind];
      return [
        chipOf(
          each,
          kind === "attention"
            ? [each.word, ...Object.values(UNFINISHED_HEADINGS)]
            : [each.word],
        ),
      ];
    },
  ),
];

type HeldKind = FolderSkillReading | "edits-in-harness";

// How a target was built outranks what the drift check made of it; nothing
// shows before a reading has answered.
export function targetStatus({
  indicator,
  pinnedPerSkill = false,
  behind = false,
  pending,
  localEdits = false,
  editsInHarness = false,
  notUpdated = false,
  missing = false,
}: {
  indicator: TargetDriftIndicator;
  pinnedPerSkill?: boolean;
  behind?: boolean;
  /** Undefined where nothing unfinished stands, or the read failed. */
  pending: PendingOperation["kind"] | undefined;
  // A deployed skill's files changed after deployment: it blocks the next step.
  localEdits?: boolean;
  // A deployed skill's edits are in the Working harness, not yet in a release.
  editsInHarness?: boolean;
  // A Global folder holds an unedited copy at another release than the Target release.
  notUpdated?: boolean;
  // A Global folder lacks skills of Global's one skill list.
  missing?: boolean;
}): StatusReading | null {
  if (pending) return unfinishedReading(pending);
  const holds: Partial<Record<TargetKind, boolean>> = {
    "local-edits": localEdits,
    missing,
    "not-updated": notUpdated,
    "edits-in-harness": editsInHarness,
  } satisfies Record<HeldKind, boolean>;
  const held = TARGET_ORDER.find(
    (kind): kind is HeldKind => holds[kind] === true,
  );
  if (held !== undefined && indicator !== "pending") {
    return indicator === "attention" ? ATTENTION : TARGET_READINGS[held];
  }
  if (pinnedPerSkill) return PINNED;
  switch (indicator) {
    case "ok":
      return behind ? BEHIND : IN_SYNC;
    case "attention":
      return ATTENTION;
    case "drift":
      return BEHIND;
    case "empty":
      return EMPTY;
    case "foreign":
      return OTHER_ORIGIN;
    case "unknown":
    case "unverified":
      return UNKNOWN;
    case "pending":
      return null;
  }
}
