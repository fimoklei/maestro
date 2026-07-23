// Folds the chosen bulk-deploy destination into the DeploymentTarget[] shape
// planBulkDeploy reads: a repo is always one target, but "Global" is one per
// detected tool — apm tracks each tool's install separately, so a skill
// present on Claude Code but missing on Codex must not read as fully clean
// (mirrors use-deployment-targets.ts, #292). A still-loading read stays
// "pending", so a skill is attempted rather than assumed clean. Pure and
// framework-free, sibling-tested; the bulk bar reads already-fetched data
// through it instead of folding tool/primitive shapes inline.

import { toolPresentation } from "../deploy-state/tool-presentation";
import type { DeployedPrimitive } from "../deploy-state/use-deploy-state";
import type { ToolDeployState } from "../deploy-state/use-global-deploy-state";
import type { DriftViewModel } from "../drift/drift-view-model";
import type { DeploymentTarget } from "./deployed-rollup";

export function chosenBulkDeployTargets(params: {
  isGlobal: boolean;
  targetLabel: string;
  // The global per-tool read; undefined while it is still loading.
  globalTools: ToolDeployState[] | undefined;
  // The single repo's deployed primitives; undefined while its read is still
  // loading. Ignored when isGlobal is true.
  repoPrimitives: DeployedPrimitive[] | undefined;
  drift: DriftViewModel;
}): DeploymentTarget[] {
  const { isGlobal, targetLabel, globalTools, repoPrimitives, drift } = params;

  if (isGlobal) {
    if (globalTools === undefined) {
      return [
        {
          label: targetLabel,
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
        deployed: { status: "ready", names, skippedCount: 0 },
        primitives: tool.primitives,
        drift: drift.forTool(names),
      };
    });
  }

  return [
    {
      label: targetLabel,
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
