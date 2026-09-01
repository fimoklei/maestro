import type { UseQueryResult } from "@tanstack/react-query";
import type { TargetDriftIndicator } from "../drift/drift-view-model";
import { skippedNeedsAttention } from "./skipped-entry-text";
import type { DeployedPrimitive, SkippedEntry } from "./use-deploy-state";

// Pending/unknown must stay distinct from confirmed-empty, or the drift
// roll-up reads "in sync" while a real behind entry is hidden (the J04 lie).
// `skippedCount`: a target with 0 primitives but skipped entries isn't empty.
// `attentionCount`: skipped entries the user can act on (#358).
export type DeployedView =
  | { status: "pending" }
  | { status: "unknown" }
  | {
      status: "ready";
      names: string[];
      skippedCount: number;
      attentionCount: number;
    };

// `read` is optional: pass it only when the caller renders stale rows after a
// failed refetch (the sidebar does), so that case maps to "unknown", not a
// false "ready" (J04, see above). Omitting it stays "ready".
// `attentionCount` is the global section's, not this tool's: an entry apm
// could not manage names no tool, and every card reads the same lockfile — so
// they all carry it rather than one card guessing (#358).
export function toolDeployedView(
  names: string[],
  read?: { data: unknown; isError: boolean },
  attentionCount = 0,
): DeployedView {
  if (read?.isError) {
    return { status: "unknown" };
  }
  if (read !== undefined && read.data === undefined) {
    return { status: "pending" };
  }
  return { status: "ready", names, skippedCount: 0, attentionCount };
}

// The sidebar row and the global card both compute their own indicator, so
// this is the one place that upgrades a confirmed "empty" to "foreign" —
// otherwise the two readings of the same target could disagree (#655).
export function withOtherOrigins(
  indicator: TargetDriftIndicator,
  otherOrigins: string[],
): TargetDriftIndicator {
  return indicator === "empty" && otherOrigins.length > 0
    ? "foreign"
    : indicator;
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
    attentionCount: deployState.data.skipped.filter(skippedNeedsAttention)
      .length,
  };
}
