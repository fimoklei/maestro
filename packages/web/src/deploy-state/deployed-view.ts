import type { UseQueryResult } from "@tanstack/react-query";
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
  return { status: "ready", names, skippedCount: 0, attentionCount: 0 };
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
