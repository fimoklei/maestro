// Aggregates a whole target's drift into a single indicator for the sidebar
// Targets list and the card header. A target is "drift" only when a behind entry
// matches a primitive deployed in this target — a behind name with no deployed
// match (an orphan-behind) cannot be updated here, so it must not flip the
// target to "drift". The join needs both the drift check AND the deployed set to
// be known: while either is still loading it is "pending", and if either could
// not be read it is "unknown" — never silently "ok" (the J04 rule, mirrored from
// skillDriftStatus). "ok" only once both are known and nothing deployable is
// behind.
//
// "empty" comes first: a target with nothing deployed (deployed read cleanly,
// zero primitives and zero skipped entries) can't drift — there is nothing to be
// behind — so a confirmed-empty deployment wins over the drift check, even a
// failed or still-loading one. This is the fresh-repo case: it must read
// "empty", not the "unknown" that a failed check would otherwise show (and not
// "ok", which would imply deployed content that matches). A lockfile of only
// unsupported types comes back as zero primitives but a non-empty skipped set —
// that target does contain deployed content, so it is not empty (the same rule
// deploy-state-list applies before it drops its body); it falls through to the
// drift-derived status. Emptiness only counts once deployed is *confirmed*
// (status "ready"); while it is pending/unknown we don't yet know it is empty, so
// the drift-based logic below still runs. Pure and framework-free, sibling-tested.

import type { DeployedView } from "../deploy-state/deployed-view";
import type { DriftView } from "./drift-status";

export type TargetDriftIndicator =
  | "ok"
  | "drift"
  | "empty"
  | "unknown"
  | "unverified"
  | "pending";

export const targetDriftIndicator = (
  deployed: DeployedView,
  drift: DriftView,
): TargetDriftIndicator => {
  if (
    deployed.status === "ready" &&
    deployed.names.length === 0 &&
    deployed.skippedCount === 0
  ) {
    return "empty";
  }
  switch (drift.status) {
    case "pending":
      return "pending";
    case "unknown":
      return "unknown";
    case "unverified":
      return "unverified";
    case "ready":
      switch (deployed.status) {
        case "pending":
          return "pending";
        case "unknown":
          return "unknown";
        case "ready": {
          const names = new Set(deployed.names);
          return drift.behind.some((entry) => names.has(entry.name))
            ? "drift"
            : "ok";
        }
      }
  }
};
