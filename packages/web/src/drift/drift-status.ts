// Pure mapping from the drift query's view-state to a per-skill badge. Kept
// framework-free and co-located with a sibling unit test (frontend.md). The
// cardinal rule (J04): a check that could not run is "unknown", never
// "up-to-date" — up-to-date is only ever derived from a check that ran.

import type { VersionDrift } from "./use-drift";

export type DriftView =
  // The drift query is still in flight or has no data yet.
  | { status: "pending" }
  // The check could not run (server reported { ok: false }, or the request
  // itself failed). Every deployed skill is "unknown".
  | { status: "unknown" }
  // The check ran: `behind` carries one deployed -> latest pair per skill behind
  // the latest tag (ADR-0007). The per-skill status still derives from the name.
  | { status: "ready"; behind: VersionDrift[] };

export type DriftStatus = "behind" | "up-to-date" | "unknown" | "pending";

export const skillDriftStatus = (
  name: string,
  drift: DriftView,
): DriftStatus => {
  switch (drift.status) {
    case "pending":
      return "pending";
    case "unknown":
      return "unknown";
    case "ready":
      return drift.behind.some((entry) => entry.name === name)
        ? "behind"
        : "up-to-date";
  }
};

// Behind names the check reported that are not deployed skills in this repo.
// Surfaced (not dropped) so the cockpit never silently hides a behind primitive
// it cannot place against the deployed list.
export const orphanBehind = (
  deployedNames: string[],
  drift: DriftView,
): string[] => {
  if (drift.status !== "ready") {
    return [];
  }
  const deployed = new Set(deployedNames);
  return drift.behind
    .map((entry) => entry.name)
    .filter((name) => !deployed.has(name));
};
