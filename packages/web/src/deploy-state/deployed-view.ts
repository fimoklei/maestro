import type { UseQueryResult } from "@tanstack/react-query";
import type { TargetDriftIndicator } from "../drift/drift-view-model";
import { skippedNeedsAttention } from "./skipped-entry-text";
import type { DeployedPrimitive, SkippedEntry } from "./use-deploy-state";

// Pending/unknown must stay distinct from confirmed-empty, or the drift roll-up
// reads "in sync" while a real behind entry is hidden.
export type DeployedView =
  | { status: "pending" }
  | { status: "unknown" }
  | {
      status: "ready";
      names: string[];
      skippedCount: number;
      attentionCount: number;
    };

// Pass `read` only when the caller renders stale rows after a failed refetch, so
// that case maps to "unknown", not a false "ready".
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

export function globalToolView(
  names: string[],
  skipped: readonly SkippedEntry[],
): DeployedView {
  return toolDeployedView(
    names,
    undefined,
    skipped.filter(skippedNeedsAttention).length,
  );
}

// The one place that upgrades a confirmed "empty" to "foreign", so the sidebar
// and the card never disagree (#655).
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
