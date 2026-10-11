// The deploy targets holding this skill that a bulk remove acts on (#422), in
// pane order. Per DeployTarget, not per row: apm's uninstall has no -t, so
// global's per-tool rows are one removal.

import type { DeploymentTarget } from "./deployed-rollup";
import { type DeployTarget, targetQueryKey } from "./use-deploy-skill";

export type BulkRemoveCandidate = {
  target: DeployTarget;
  label: string;
  version: string;
};

// No tool's own name describes a removal that covers every tool.
const GLOBAL_LABEL = "Global";

export function bulkRemoveTargets(
  skillName: string,
  targets: DeploymentTarget[],
): BulkRemoveCandidate[] {
  const seen = new Set<string>();
  const removable: BulkRemoveCandidate[] = [];
  for (const target of targets) {
    // Unread is unknown, not "deployed here" — left out of the run.
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
    const deployed = target.primitives.find(
      (primitive) => primitive.name === skillName,
    );
    removable.push({
      target: target.target,
      // A repo keeps the name its pane row shows (#1476).
      label: target.target.kind === "global" ? GLOBAL_LABEL : target.label,
      // The names list said the skill is here, so a missing version is a
      // short read, not an absent copy — stated as unknown, never as clean.
      version: deployed?.version ?? "Unknown",
    });
  }

  return removable;
}
