import type { TargetDriftIndicator } from "../drift/drift-view-model";
import { reading, type StatusReading } from "../ui/status-reading";
import { MIXED_RELEASES } from "./update-target-copy";

const MIXED = reading(MIXED_RELEASES, "attention", "⚠");
const ATTENTION = reading("Attention", "attention", "⚠");
export const LOCAL_EDITS = reading("Local edits", "attention", "✎");
const BEHIND = reading("Behind", "attention");
const UNKNOWN = reading("Unknown", "unknown");
const IN_SYNC = reading("In sync", "good");
const PINNED = reading("Pinned per skill", "neutral", "•");
const OTHER_ORIGIN = reading("Other origin", "neutral", "•");
const EMPTY = reading("Empty", "neutral");

/** Every word the badge can read, worst first, as Filter offers them. */
export const TARGET_STATUS_WORDS = [
  MIXED,
  ATTENTION,
  LOCAL_EDITS,
  BEHIND,
  UNKNOWN,
  IN_SYNC,
  PINNED,
  OTHER_ORIGIN,
  EMPTY,
].map((value) => value.word);

// A target's one Status badge (#993). How a target was built outranks what the
// drift check made of it; nothing shows before a reading has answered (J04).
export function targetStatus({
  indicator,
  pinnedPerSkill = false,
  behind = false,
  mixedReleases = false,
  localEdits = false,
}: {
  indicator: TargetDriftIndicator;
  // Deployed one skill at a time: no release was adopted here (#950).
  pinnedPerSkill?: boolean;
  // The target's release is not the latest one (ADR-0031).
  behind?: boolean;
  // An Update that stopped part-way (#954).
  mixedReleases?: boolean;
  // A deployed skill's files changed after deployment: it blocks the next step.
  localEdits?: boolean;
}): StatusReading | null {
  if (mixedReleases) return MIXED;
  if (localEdits && indicator === "attention") return ATTENTION;
  if (localEdits && indicator !== "pending") return LOCAL_EDITS;
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
