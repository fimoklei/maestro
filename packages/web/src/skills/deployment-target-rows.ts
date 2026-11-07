import { GLOBAL } from "../deploy-state/deploy-state-copy";
import type { DeployStateRead } from "../deploy-state/deployed-view";
import { globalToolView, toDeployedView } from "../deploy-state/deployed-view";
import { toolDisplayName } from "../deploy-state/tool-presentation";
import type { GlobalDeployStateView } from "../deploy-state/use-global-deploy-state";
import type { DriftViewModel } from "../drift/drift-view-model";
import type { DeploymentTarget } from "../inventory/deployed-rollup";
import type { DeployTarget } from "../inventory/use-deploy-skill";

/** Global as one target row; none while no tool is detected. */
export function globalTargets(
  state: Pick<
    GlobalDeployStateView,
    "primitives" | "folders" | "releaseHead" | "skipped" | "pendingOperation"
  >,
  drift: DriftViewModel,
): DeploymentTarget[] {
  const written = state.folders.filter((folder) => folder.detected);
  if (written.length === 0) {
    return [];
  }
  const releaseHead = state.releaseHead;
  const names = state.primitives.map((primitive) => primitive.name);
  return [
    {
      label: GLOBAL,
      target: { kind: "global" },
      folders: written.map((folder) => folder.path),
      deployed: globalToolView(names, state.skipped, releaseHead),
      primitives: state.primitives,
      drift: drift.forTool(names),
      // Global's one Release head answers the per-skill reading; the drift
      // model is the fallback where there is none (#956).
      ...(releaseHead ? { releaseHead } : {}),
      pending: state.pendingOperation?.kind,
    },
  ];
}

// Bulk deploy plans per folder, so a copy present in one folder and missing
// in another never reads as deployed (#292). A global entry apm could not
// manage names no folder, so every row carries the section-wide count (#358).
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
        target: { kind: "global" },
        deployed: globalToolView(names, state.skipped, releaseHead),
        primitives: folder.primitives,
        drift: drift.forTool(names),
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
