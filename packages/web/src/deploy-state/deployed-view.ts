import type { UseQueryResult } from "@tanstack/react-query";
import type { TargetDriftIndicator } from "../drift/drift-view-model";
import { skippedNeedsAttention } from "./skipped-entry-text";
import type {
  DeployedPrimitive,
  ReleaseHead,
  SkippedEntry,
} from "./use-deploy-state";

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

export function globalToolView(
  names: string[],
  skipped: readonly SkippedEntry[],
): DeployedView {
  return {
    status: "ready",
    names,
    skippedCount: 0,
    attentionCount: skipped.filter(skippedNeedsAttention).length,
  };
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

export type DeployStateRead = Pick<
  UseQueryResult<{
    primitives: DeployedPrimitive[];
    skipped: SkippedEntry[];
    releaseHead?: ReleaseHead;
  }>,
  "data" | "isError"
>;

export function toDeployedView(deployState: DeployStateRead): DeployedView {
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
