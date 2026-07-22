// Gathers every deploy target the inventory column pivots over — each detected
// global tool (ADR-0011) and each registered repo — into one flat list the
// per-skill roll-up folds (deployed-rollup.ts, #272). It only assembles cached
// server-state into the target shape; the counting lives in the pure roll-up and
// the honesty rules in the drift view-model. No new server read: it reuses the
// deploy-state and drift queries the rest of the cockpit already runs.

import { useQueries } from "@tanstack/react-query";
import { toDeployedView } from "../deploy-state/deployed-view";
import { deployStateQueryOptions } from "../deploy-state/use-deploy-state";
import { useGlobalDeployState } from "../deploy-state/use-global-deploy-state";
import { driftViewModel } from "../drift/drift-view-model";
import { driftQueryOptions, useGlobalDrift } from "../drift/use-drift";
import type { DeploymentTarget } from "./deployed-rollup";

export function useDeploymentTargets(
  repoPaths: string[],
  // The registry read's own state. The repo set is unknown until it resolves, so
  // its loading/error must reach the roll-up — otherwise a repo-deployed skill
  // reads "deployed nowhere" during a normal load or a registry outage (J04).
  registry: { isLoading: boolean; isError: boolean },
): DeploymentTarget[] {
  const globalDeploy = useGlobalDeployState();
  const globalDrift = driftViewModel(useGlobalDrift());
  const repoDeploy = useQueries({
    queries: repoPaths.map(deployStateQueryOptions),
  });
  const repoDrift = useQueries({ queries: repoPaths.map(driftQueryOptions) });

  const targets: DeploymentTarget[] = [];

  // The drift on a non-ready target is never read (the roll-up only joins drift
  // against a confirmed-deployed target), so a placeholder can carry any model.
  const unresolvedDrift = globalDrift;

  // The repo set itself is unknown until the registry resolves; a placeholder
  // keeps repo reach unconfirmed while it loads (pending) or after it failed
  // (unknown), rather than collapsing to zero repos.
  if (registry.isLoading) {
    targets.push({ deployed: { status: "pending" }, drift: unresolvedDrift });
  } else if (registry.isError) {
    targets.push({ deployed: { status: "unknown" }, drift: unresolvedDrift });
  }

  // The tool set is unknown until the global read resolves, so while it loads a
  // single pending target stands in — a globally-deployed skill then reads as
  // still-resolving, not a confirmed "deployed nowhere" (J04). Once resolved it
  // is one target per detected tool. The single global drift check is narrowed
  // to each tool's skills, so a skill behind on another tool never spills into
  // this tool's count (the same forTool slice the global targets section uses).
  if (globalDeploy.isLoading) {
    targets.push({ deployed: { status: "pending" }, drift: globalDrift });
  } else if (globalDeploy.isError) {
    // A failed global read is unknown, not empty — a globally-deployed skill must
    // not read as "deployed nowhere" because the read broke (J04). Stale cached
    // tools are dropped so the count never presents old data as current.
    targets.push({ deployed: { status: "unknown" }, drift: globalDrift });
  } else {
    for (const tool of globalDeploy.data?.tools ?? []) {
      const names = tool.primitives.map((primitive) => primitive.name);
      targets.push({
        deployed: { status: "ready", names, skippedCount: 0 },
        drift: globalDrift.forTool(names),
      });
    }
  }

  // One target per registered repo, each with its own deploy-state and drift.
  // While a repo's reads are still in flight the target stays pending, so the
  // roll-up leaves it uncounted rather than claiming "deployed nowhere".
  // useQueries returns one result per query in order, so index i is repo i. The
  // pending fallback only guards the impossible short-read; TS cannot see the
  // arrays share repoPaths' length.
  const pending = { data: undefined, isError: false } as const;
  repoPaths.forEach((_, index) => {
    targets.push({
      deployed: toDeployedView(repoDeploy[index] ?? pending),
      drift: driftViewModel(repoDrift[index] ?? pending),
    });
  });

  return targets;
}
