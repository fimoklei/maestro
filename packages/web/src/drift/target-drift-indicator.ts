// Aggregates a whole target's drift into a single indicator for the sidebar
// Targets list and the card header. A target is "drift" only when a behind entry
// matches a primitive deployed in this target — a behind name with no deployed
// match (an orphan-behind) cannot be updated here, so it must not flip the
// target to "drift". The join needs both the drift check AND the deployed set to
// be known: while either is still loading it is "pending", and if either could
// not be read it is "unknown" — never silently "ok" (the J04 rule, mirrored from
// skillDriftStatus). "ok" only once both are known and nothing deployable is
// behind. Pure and framework-free, sibling-tested.

import type { DeployedView } from "../deploy-state/deployed-view";
import type { DriftView } from "./drift-status";

export type TargetDriftIndicator =
  | "ok"
  | "drift"
  | "unknown"
  | "unverified"
  | "pending";

export const targetDriftIndicator = (
  deployed: DeployedView,
  drift: DriftView,
): TargetDriftIndicator => {
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
