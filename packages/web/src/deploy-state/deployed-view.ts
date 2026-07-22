import type { UseQueryResult } from "@tanstack/react-query";
import type { DeployedPrimitive, SkippedEntry } from "./use-deploy-state";

// The deploy-state query's state, reduced to what the drift roll-up needs: the
// deployed primitive names, but only once they are actually known. A target's
// drift can only be judged against what is deployed there, so "still loading"
// and "could not read" must stay distinct from a confirmed-empty deployment —
// collapsing them to [] would let the roll-up read "in sync" while a real behind
// entry is hidden (the J04 lie). Mirrors DriftView's pending/unknown/ready.
//
// `skippedCount` carries how many lockfile entries were dropped as unsupported
// types. It is not part of the drift join (only supported names can drift), but
// the empty roll-up needs it: a target with zero primitives but a non-empty
// skipped set does contain deployed content, so it is not empty — the same rule
// deploy-state-list applies to its "Nothing deployed" message.
export type DeployedView =
  | { status: "pending" }
  | { status: "unknown" }
  | { status: "ready"; names: string[]; skippedCount: number };

// A detected tool's deployed set for the drift roll-up. Its primitive names are
// known once the global deploy-state read resolves (status "ready"); its skipped
// entries are surfaced section-wide rather than per tool, so the view carries
// only names with skippedCount 0. One owner for that shape, shared by the
// global-targets cards and the sidebar's per-tool rows, so they can never drift.
//
// The optional read-state keeps the sidebar honest: TanStack retains the
// last-good tools after a refetch fails, so a caller that renders those stale
// rows (the sidebar does; the cards gate on error and never do) must pass the
// query — a failed read maps to "unknown", never a "ready" set the roll-up would
// join into a false "in sync"/▲N (J04). Omitting it stays "ready".
export function toolDeployedView(
  names: string[],
  read?: { data: unknown; isError: boolean },
): DeployedView {
  if (read?.isError) {
    return { status: "unknown" };
  }
  if (read !== undefined && read.data === undefined) {
    return { status: "pending" };
  }
  return { status: "ready", names, skippedCount: 0 };
}

export function toDeployedView(
  deployState: Pick<
    UseQueryResult<{
      primitives: DeployedPrimitive[];
      skipped: SkippedEntry[];
    }>,
    "data" | "isError"
  >,
): DeployedView {
  if (deployState.isError) {
    return { status: "unknown" };
  }
  if (deployState.data === undefined) {
    return { status: "pending" };
  }
  return {
    status: "ready",
    names: deployState.data.primitives.map((primitive) => primitive.name),
    skippedCount: deployState.data.skipped.length,
  };
}
