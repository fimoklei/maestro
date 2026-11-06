import type { DeployStateRead } from "../deploy-state/deployed-view";
import { globalToolView, toDeployedView } from "../deploy-state/deployed-view";
import { toolDisplayName } from "../deploy-state/tool-presentation";
import type { GlobalDeployStateView } from "../deploy-state/use-global-deploy-state";
import type { DriftViewModel } from "../drift/drift-view-model";
import type { DeploymentTarget } from "../inventory/deployed-rollup";
import type { DeployTarget } from "../inventory/use-deploy-skill";

// A global entry apm could not manage names no tool, so every tool row carries
// the section-wide attention count (#358).
export function globalToolTargets(
  state: Pick<
    GlobalDeployStateView,
    "folders" | "releaseHead" | "skipped" | "pendingOperation"
  >,
  drift: DriftViewModel,
): DeploymentTarget[] {
  const releaseHead = state.releaseHead;
  return state.folders
    .filter((folder) => folder.detected)
    .map((folder) => {
      const names = folder.primitives.map((primitive) => primitive.name);
      return {
        label: toolDisplayName(folder.tool),
        // One removal covers every folder, so each row names the same global target.
        target: { kind: "global" },
        tool: folder.tool,
        deployed: globalToolView(names, state.skipped, releaseHead),
        primitives: folder.primitives,
        drift: drift.forTool(names),
        // Global's one Release head answers the per-skill reading; the drift
        // model is the fallback where there is none (#956).
        ...(releaseHead ? { releaseHead } : {}),
        pending: state.pendingOperation?.kind,
      };
    });
}

export function repoTarget(params: {
  label: string;
  target: DeployTarget;
  read: DeployStateRead;
  drift: DriftViewModel;
}): DeploymentTarget {
  const { label, target, read, drift } = params;
  return {
    label,
    target,
    deployed: toDeployedView(read),
    primitives: read.data?.primitives ?? [],
    drift,
    ...(read.data?.releaseHead ? { releaseHead: read.data.releaseHead } : {}),
    pending: read.data?.pendingOperation?.kind,
  };
}
