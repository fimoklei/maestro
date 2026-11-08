import type { PendingOperation } from "@maestro/core";
import type { TargetDriftIndicator } from "../drift/drift-view-model";
import type { StatusChip } from "../ui/band-summary";
import { WARNING_GLYPH } from "../ui/status-family";
import { reading, type StatusReading } from "../ui/status-reading";
import { FOLDER_READINGS, type FolderSkillReading } from "./folder-reading";
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
const UNKNOWN = reading("Unknown", "unknown");
export const IN_SYNC = reading("In sync", "good");
const PINNED = reading("Pinned per skill", "neutral");
const OTHER_ORIGIN = reading("Other origin", "neutral");
const EMPTY = reading("Empty", "neutral");

// A target's reading for each folder reading, which keeps its order.
const FOLDER_ROLLUP = {
  "local-edits": LOCAL_EDITS,
  missing: SKILLS_MISSING,
  "not-updated": NOT_UPDATED,
} satisfies Record<FolderSkillReading, StatusReading>;
const DEVIATIONS = FOLDER_READINGS.map((each) => FOLDER_ROLLUP[each]);

/** Every word the badge can read, worst first, as Filter offers them. */
export const TARGET_STATUS_WORDS = [
  ...Object.values(UNFINISHED_HEADINGS),
  ...[
    ATTENTION,
    ...DEVIATIONS,
    BEHIND,
    UNKNOWN,
    IN_SYNC,
    PINNED,
    OTHER_ORIGIN,
    EMPTY,
  ].map((value) => value.word),
];

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

/** Band 2's count chips, worst first; the unfinished operations roll into Attention. */
export const TARGET_CHIPS: readonly StatusChip[] = [
  { word: UNKNOWN.word, family: "failed", covers: [UNKNOWN.word] },
  {
    word: ATTENTION.word,
    family: "attention",
    covers: [ATTENTION.word, ...Object.values(UNFINISHED_HEADINGS)],
  },
  ...[...DEVIATIONS, BEHIND].map(
    (each): StatusChip => ({
      word: each.word,
      family: "attention",
      covers: [each.word],
    }),
  ),
];

// How a target was built outranks what the drift check made of it; nothing
// shows before a reading has answered.
export function targetStatus({
  indicator,
  pinnedPerSkill = false,
  behind = false,
  pending,
  localEdits = false,
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
  // A Global folder holds an unedited copy at another release than the Target release.
  notUpdated?: boolean;
  // A Global folder lacks skills of Global's one skill list.
  missing?: boolean;
}): StatusReading | null {
  if (pending) return unfinishedReading(pending);
  const deviates = {
    "local-edits": localEdits,
    missing,
    "not-updated": notUpdated,
  } satisfies Record<FolderSkillReading, boolean>;
  const worst = FOLDER_READINGS.find((each) => deviates[each]);
  if (worst !== undefined && indicator === "attention") return ATTENTION;
  if (worst !== undefined && indicator !== "pending") {
    return FOLDER_ROLLUP[worst];
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
