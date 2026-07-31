// What a bulk remove would act on (#422): the deploy targets holding this
// skill, in pane order. A removal is per DeployTarget, not per pane row —
// apm's uninstall has no -t, so global's per-tool rows are one removal
// (ADR-0013).

import type { DeploymentTarget } from "./deployed-rollup";
import { type DeployTarget, targetQueryKey } from "./use-deploy-skill";

export function bulkRemoveTargets(
  skillName: string,
  targets: DeploymentTarget[],
): DeployTarget[] {
  const seen = new Set<string>();
  const removable: DeployTarget[] = [];

  for (const target of targets) {
    // Unread is unknown, not "deployed here" — left out of the run (J04).
    if (target.deployed.status !== "ready") {
      continue;
    }
    if (!target.deployed.names.includes(skillName)) {
      continue;
    }
    const key = targetQueryKey(target.target);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    removable.push(target.target);
  }

  return removable;
}
