import type { UseQueryResult } from "@tanstack/react-query";
import type { DriftView } from "./drift-status";
import type { DriftResponse } from "./use-drift";

// Maps the drift query's state to the view-state the list consumes. A request
// failure (or a 4xx) becomes "unknown", never up-to-date — the same honesty the
// server keeps when its { ok: false } body says the check could not run.
export function toDriftView(
  drift: Pick<UseQueryResult<DriftResponse>, "data" | "isError">,
): DriftView {
  if (drift.isError) {
    return { status: "unknown" };
  }
  if (drift.data === undefined) {
    return { status: "pending" };
  }
  // The check ran iff the body carries a behind set; { ok: false } means it
  // could not run — shown as unknown, never up-to-date.
  if ("behind" in drift.data) {
    return { status: "ready", behind: drift.data.behind };
  }
  return { status: "unknown" };
}
