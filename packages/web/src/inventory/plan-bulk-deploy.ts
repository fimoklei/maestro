// The pre-flight plan for a bulk deploy. A skill skips as a no-op only once
// confirmed present AND up-to-date on every target — a skill missing from a
// newly-added tool is never mistaken for fully clean (#292).

import type { DeployedView } from "../deploy-state/deployed-view";
import type { DeploymentTarget } from "./deployed-rollup";

export type BulkDeployPlan = {
  // Names to send to the target, in the caller's order.
  toDeploy: string[];
  skippedClean: string[];
  // Confirmed behind on at least one target: an update, not a first install (#292).
  updateToLatest: string[];
};

function deployedOn(deployed: DeployedView, name: string): boolean {
  return deployed.status === "ready" && deployed.names.includes(name);
}

// Folds "deployed here" + drift in one pass, so the plan never walks
// `targets` twice for the same check.
function targetStatus(
  target: DeploymentTarget,
  name: string,
): "up-to-date" | "behind" | "other" {
  if (!deployedOn(target.deployed, name)) {
    return "other";
  }
  const status = target.drift.skillStatus(name);
  return status === "up-to-date" || status === "behind" ? status : "other";
}

export function planBulkDeploy(
  names: string[],
  targets: DeploymentTarget[],
): BulkDeployPlan {
  const toDeploy: string[] = [];
  const skippedClean: string[] = [];
  const updateToLatest: string[] = [];

  for (const name of names) {
    // A single un-run or missing target keeps the skill attempted, not
    // assumed clean (J04).
    let allUpToDate = targets.length > 0;
    let confirmedBehindSomewhere = false;
    for (const target of targets) {
      const status = targetStatus(target, name);
      if (status !== "up-to-date") {
        allUpToDate = false;
      }
      if (status === "behind") {
        confirmedBehindSomewhere = true;
      }
    }

    if (allUpToDate) {
      skippedClean.push(name);
      continue;
    }
    toDeploy.push(name);
    if (confirmedBehindSomewhere) {
      updateToLatest.push(name);
    }
  }

  return { toDeploy, skippedClean, updateToLatest };
}
