import type { DeployStateRead } from "../deploy-state/deployed-view";
import { globalToolView, toDeployedView } from "../deploy-state/deployed-view";
import { toolPresentation } from "../deploy-state/tool-presentation";
import type { GlobalDeployStateView } from "../deploy-state/use-global-deploy-state";
import type { DriftViewModel } from "../drift/drift-view-model";
import type { DeploymentTarget } from "./deployed-rollup";
import type { DeployTarget } from "./use-deploy-skill";

// A global entry apm could not manage names no tool, so every tool row carries
// the section-wide attention count (#358).
export function globalToolTargets(
  state: Pick<GlobalDeployStateView, "tools" | "skipped">,
  drift: DriftViewModel,
): DeploymentTarget[] {
  return state.tools.map((tool) => {
    const names = tool.primitives.map((primitive) => primitive.name);
    return {
      label: toolPresentation(tool.tool).label,
      // One removal covers every tool, so each tool row names the same global target.
      target: { kind: "global" },
      tool: tool.tool,
      deployed: globalToolView(names, state.skipped),
      primitives: tool.primitives,
      drift: drift.forTool(names),
      // Under one release, this tool's own Release head answers the per-skill
      // reading; the drift model is the fallback where there is none (#956).
      ...(tool.releaseHead ? { releaseHead: tool.releaseHead } : {}),
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
  };
}
