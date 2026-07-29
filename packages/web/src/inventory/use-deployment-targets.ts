// Gathers every deploy target (each detected tool, ADR-0011, and each
// registered repo) into one flat list for the roll-up (#272). No new server
// read — reuses the deploy-state and drift queries the cockpit already runs.

import { useQueries } from "@tanstack/react-query";
import { toDeployedView } from "../deploy-state/deployed-view";
import { toolPresentation } from "../deploy-state/tool-presentation";
import { deployStateQueryOptions } from "../deploy-state/use-deploy-state";
import { useGlobalDeployState } from "../deploy-state/use-global-deploy-state";
import { driftViewModel } from "../drift/drift-view-model";
import { driftQueryOptions, useGlobalDrift } from "../drift/use-drift";
import type { DeploymentTarget } from "./deployed-rollup";

export function useDeploymentTargets(
  repoPaths: string[],
  // Loading/error must reach the roll-up, or a repo-deployed skill reads
  // "deployed nowhere" during a normal load or registry outage (J04).
  registry: { isLoading: boolean; isError: boolean },
): DeploymentTarget[] {
  const globalDeploy = useGlobalDeployState();
  const globalDrift = driftViewModel(useGlobalDrift());
  const repoDeploy = useQueries({
    queries: repoPaths.map(deployStateQueryOptions),
  });
  const repoDrift = useQueries({ queries: repoPaths.map(driftQueryOptions) });

  const targets: DeploymentTarget[] = [];

  // Drift on a non-ready target is never read, so a placeholder can carry any model.
  const unresolvedDrift = globalDrift;

  // Placeholders keep the reach honest while the set is unknown — no target,
  // no primitives; the count reads their status, the pane skips them.
  if (registry.isLoading) {
    targets.push({
      label: "",
      deployed: { status: "pending" },
      primitives: [],
      drift: unresolvedDrift,
    });
  } else if (registry.isError) {
    targets.push({
      label: "",
      deployed: { status: "unknown" },
      primitives: [],
      drift: unresolvedDrift,
    });
  }

  // While loading, one pending target stands in so a globally-deployed skill
  // reads as still-resolving, not "deployed nowhere" (J04).
  if (globalDeploy.isLoading) {
    targets.push({
      label: "",
      deployed: { status: "pending" },
      primitives: [],
      drift: globalDrift,
    });
  } else if (globalDeploy.isError) {
    // Unknown, not empty (J04). Stale cached tools dropped, never presented as current.
    targets.push({
      label: "",
      deployed: { status: "unknown" },
      primitives: [],
      drift: globalDrift,
    });
  } else {
    for (const tool of globalDeploy.data?.tools ?? []) {
      const names = tool.primitives.map((primitive) => primitive.name);
      targets.push({
        label: toolPresentation(tool.tool).label,
        deployed: { status: "ready", names, skippedCount: 0 },
        primitives: tool.primitives,
        drift: globalDrift.forTool(names),
      });
    }
  }

  // useQueries returns one result per query in order, so index i is repo i.
  // The pending fallback only guards the impossible short-read.
  const pending = { data: undefined, isError: false } as const;
  repoPaths.forEach((repoPath, index) => {
    const deploy = repoDeploy[index] ?? pending;
    targets.push({
      label: repoPath,
      deployed: toDeployedView(deploy),
      primitives: deploy.data?.primitives ?? [],
      drift: driftViewModel(repoDrift[index] ?? pending),
    });
  });

  return targets;
}
