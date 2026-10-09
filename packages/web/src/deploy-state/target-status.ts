import type { PendingOperation } from "@maestro/core";
import type { TargetDriftIndicator } from "../drift/drift-view-model";
import { WARNING_GLYPH } from "../ui/status-family";
import { reading, type StatusReading } from "../ui/status-reading";
import { UNFINISHED_HEADINGS } from "./release-head-copy";

/** An unfinished operation's badge: its pane notice's own heading. */
export const UNFINISHED: Record<PendingOperation["kind"], StatusReading> = {
  deploy: reading(UNFINISHED_HEADINGS.deploy, "attention", WARNING_GLYPH),
  remove: reading(UNFINISHED_HEADINGS.remove, "attention", WARNING_GLYPH),
  update: reading(UNFINISHED_HEADINGS.update, "attention", WARNING_GLYPH),
};
const ATTENTION = reading("Attention", "attention", WARNING_GLYPH);
export const LOCAL_EDITS = reading("Local edits", "attention", WARNING_GLYPH);
const BEHIND = reading("Behind", "attention");
const UNKNOWN = reading("Unknown", "unknown");
const IN_SYNC = reading("In sync", "good");
const PINNED = reading("Pinned per skill", "neutral");
const OTHER_ORIGIN = reading("Other origin", "neutral");
const EMPTY = reading("Empty", "neutral");

/** Every word the badge can read, worst first, as Filter offers them. */
export const TARGET_STATUS_WORDS = [
  UNFINISHED.deploy,
  UNFINISHED.remove,
  UNFINISHED.update,
  ATTENTION,
  LOCAL_EDITS,
  BEHIND,
  UNKNOWN,
  IN_SYNC,
  PINNED,
  OTHER_ORIGIN,
  EMPTY,
].map((value) => value.word);

// How a target was built outranks what the drift check made of it; nothing
// shows before a reading has answered.
export function targetStatus({
  indicator,
  pinnedPerSkill = false,
  behind = false,
  pending,
  localEdits = false,
}: {
  indicator: TargetDriftIndicator;
  pinnedPerSkill?: boolean;
  behind?: boolean;
  pending?: PendingOperation["kind"];
  // A deployed skill's files changed after deployment: it blocks the next step.
  localEdits?: boolean;
}): StatusReading | null {
  if (pending) return UNFINISHED[pending];
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
