import { targetLabel } from "../shell/target-label";
// Every deploy target (each detected tool and each registered repo) as one flat
// list for the roll-up (#272), from queries the cockpit already runs.

import { useQueries } from "@tanstack/react-query";
import { globalToolView, toDeployedView } from "../deploy-state/deployed-view";
import { toolPresentation } from "../deploy-state/tool-presentation";
import { deployStateQueryOptions } from "../deploy-state/use-deploy-state";
import { useGlobalDeployState } from "../deploy-state/use-global-deploy-state";
import { driftViewModel } from "../drift/drift-view-model";
import { driftQueryOptions, useGlobalDrift } from "../drift/use-drift";
import type { DeploymentTarget } from "./deployed-rollup";
import type { DeployTarget } from "./use-deploy-skill";

export function useDeploymentTargets(
  repoPaths: string[],
  // Loading/error must reach the roll-up, or a repo-deployed skill reads
  // "deployed nowhere" during a normal load or registry outage.
  registry: { isLoading: boolean; isError: boolean },
): DeploymentTarget[] {
  const globalDeploy = useGlobalDeployState();
  const globalDrift = driftViewModel(useGlobalDrift());
  const repoDeploy = useQueries({
    queries: repoPaths.map(deployStateQueryOptions),
  });
  const repoDrift = useQueries({ queries: repoPaths.map(driftQueryOptions) });

  const targets: DeploymentTarget[] = [];

  // Drift and target on a non-ready target are never read, so a placeholder
  // can carry any model and any target.
  const unresolvedDrift = globalDrift;
  const unresolvedTarget: DeployTarget = { kind: "global" };

  // Placeholders keep the reach honest while the set is unknown — no target,
  // no primitives; the count reads their status, the pane skips them.
  if (registry.isLoading) {
    targets.push({
      label: "",
      target: unresolvedTarget,
      deployed: { status: "pending" },
      primitives: [],
      drift: unresolvedDrift,
    });
  } else if (registry.isError) {
    targets.push({
      label: "",
      target: unresolvedTarget,
      deployed: { status: "unknown" },
      primitives: [],
      drift: unresolvedDrift,
    });
  }

  // While loading, one pending target stands in so a globally-deployed skill
  // reads as still-resolving, not "deployed nowhere".
  if (globalDeploy.isLoading) {
    targets.push({
      label: "",
      target: { kind: "global" },
      deployed: { status: "pending" },
      primitives: [],
      drift: globalDrift,
    });
  } else if (globalDeploy.isError) {
    // Unknown, not empty. Stale cached tools dropped, never presented as current.
    targets.push({
      label: "",
      target: { kind: "global" },
      deployed: { status: "unknown" },
      primitives: [],
      drift: globalDrift,
    });
  } else {
    for (const tool of globalDeploy.data?.tools ?? []) {
      const names = tool.primitives.map((primitive) => primitive.name);
      targets.push({
        label: toolPresentation(tool.tool).label,
        // One removal covers every tool, so each tool row names the same global target.
        target: { kind: "global" },
        tool: tool.tool,
        deployed: globalToolView(names, globalDeploy.data?.skipped ?? []),
        primitives: tool.primitives,
        drift: globalDrift.forTool(names),
        // Under one release, this tool's own Release head answers the per-skill
        // reading; the drift model is the fallback where there is none (#956).
        ...(tool.releaseHead ? { releaseHead: tool.releaseHead } : {}),
      });
    }
  }

  // useQueries returns one result per query in order, so index i is repo i.
  // The pending fallback only guards the impossible short-read.
  const pending = { data: undefined, isError: false } as const;
  repoPaths.forEach((repoPath, index) => {
    const deploy = repoDeploy[index] ?? pending;
    targets.push({
      // Shortened as the deploy picker names it (#211).
      label: targetLabel(repoPath, repoPaths),
      target: { kind: "repo", repoPath },
      deployed: toDeployedView(deploy),
      primitives: deploy.data?.primitives ?? [],
      drift: driftViewModel(repoDrift[index] ?? pending),
      ...(deploy.data?.releaseHead
        ? { releaseHead: deploy.data.releaseHead }
        : {}),
    });
  });

  return targets;
}
