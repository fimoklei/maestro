// Global is one target per detected tool — apm tracks each tool's install
// separately, so present-on-Claude-missing-on-Codex must not read as clean
// (#292). Still-loading stays "pending", so a skill is attempted, not assumed clean.

import type { DeployStateRead } from "../deploy-state/deployed-view";
import type { GlobalDeployStateView } from "../deploy-state/use-global-deploy-state";
import type { DriftViewModel } from "../drift/drift-view-model";
import type { DeploymentTarget } from "./deployed-rollup";
import { globalToolTargets, repoTarget } from "./deployment-target-rows";
import type { DeployTarget } from "./use-deploy-skill";

export function chosenBulkDeployTargets(params: {
  isGlobal: boolean;
  targetLabel: string;
  // What a write would name. Every row here belongs to the one chosen target.
  target: DeployTarget;
  globalState: Pick<GlobalDeployStateView, "tools" | "skipped"> | undefined;
  // Ignored when isGlobal is true.
  repoRead: DeployStateRead;
  drift: DriftViewModel;
}): DeploymentTarget[] {
  const { isGlobal, targetLabel, target, globalState, repoRead, drift } =
    params;

  if (isGlobal) {
    if (globalState === undefined) {
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
    return globalToolTargets(globalState, drift);
  }

  return [repoTarget({ label: targetLabel, target, read: repoRead, drift })];
}
