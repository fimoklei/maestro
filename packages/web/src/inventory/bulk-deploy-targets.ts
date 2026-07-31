// Global is one target per detected tool — apm tracks each tool's install
// separately, so present-on-Claude-missing-on-Codex must not read as clean
// (#292). Still-loading stays "pending", so a skill is attempted, not assumed clean.

import { toolPresentation } from "../deploy-state/tool-presentation";
import type { DeployedPrimitive } from "../deploy-state/use-deploy-state";
import type { ToolDeployState } from "../deploy-state/use-global-deploy-state";
import type { DriftViewModel } from "../drift/drift-view-model";
import type { DeploymentTarget } from "./deployed-rollup";
import type { DeployTarget } from "./use-deploy-skill";

export function chosenBulkDeployTargets(params: {
  isGlobal: boolean;
  targetLabel: string;
  // What a write would name. Every row here belongs to the one chosen target.
  target: DeployTarget;
  globalTools: ToolDeployState[] | undefined;
  // Ignored when isGlobal is true.
  repoPrimitives: DeployedPrimitive[] | undefined;
  drift: DriftViewModel;
}): DeploymentTarget[] {
  const { isGlobal, targetLabel, target, globalTools, repoPrimitives, drift } =
    params;

  if (isGlobal) {
    if (globalTools === undefined) {
      return [
        {
          label: targetLabel,
          target,
          deployed: { status: "pending" },
          primitives: [],
          drift,
        },
      ];
    }
    return globalTools.map((tool) => {
      const names = tool.primitives.map((primitive) => primitive.name);
      return {
        label: toolPresentation(tool.tool).label,
        target,
        deployed: { status: "ready", names, skippedCount: 0 },
        primitives: tool.primitives,
        drift: drift.forTool(names),
      };
    });
  }

  return [
    {
      label: targetLabel,
      target,
      deployed:
        repoPrimitives === undefined
          ? { status: "pending" }
          : {
              status: "ready",
              names: repoPrimitives.map((primitive) => primitive.name),
              skippedCount: 0,
            },
      primitives: repoPrimitives ?? [],
      drift,
    },
  ];
}
