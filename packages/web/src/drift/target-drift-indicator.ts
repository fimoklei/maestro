// Aggregates a whole target's drift into a single indicator for the sidebar
// Targets list. A target is "drift" if any deployed skill is behind, "ok" only
// when a check ran and found nothing behind, "unknown" when the check could not
// run (never silently "ok" — the J04 rule, mirrored from skillDriftStatus), and
// "pending" while in flight. Pure and framework-free, sibling-tested.

import type { DriftView } from "./drift-status";

export type TargetDriftIndicator = "ok" | "drift" | "unknown" | "pending";

export const targetDriftIndicator = (
  drift: DriftView,
): TargetDriftIndicator => {
  switch (drift.status) {
    case "pending":
      return "pending";
    case "unknown":
      return "unknown";
    case "ready":
      return drift.behind.length > 0 ? "drift" : "ok";
  }
};
