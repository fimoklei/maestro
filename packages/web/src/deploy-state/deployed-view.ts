import type { UseQueryResult } from "@tanstack/react-query";
import type { DeployedPrimitive } from "./use-deploy-state";

// The deploy-state query's state, reduced to what the drift roll-up needs: the
// deployed primitive names, but only once they are actually known. A target's
// drift can only be judged against what is deployed there, so "still loading"
// and "could not read" must stay distinct from a confirmed-empty deployment —
// collapsing them to [] would let the roll-up read "in sync" while a real behind
// entry is hidden (the J04 lie). Mirrors DriftView's pending/unknown/ready.
export type DeployedView =
  | { status: "pending" }
  | { status: "unknown" }
  | { status: "ready"; names: string[] };

export function toDeployedView(
  deployState: Pick<
    UseQueryResult<{ primitives: DeployedPrimitive[] }>,
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
  };
}
