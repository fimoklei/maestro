// The pre-flight plan for a bulk deploy. A skill skips as a no-op only once
// confirmed present AND up-to-date on every target — a skill missing from a
// newly-added tool is never mistaken for fully clean (#292). A bulk run never
// moves a target's release, so it plans no update either (ADR-0031, #956).

import type { DeployedView } from "../deploy-state/deployed-view";
import type { DeploymentTarget } from "./deployed-rollup";

export type BulkDeployPlan = {
  // Names to send to the target, in the caller's order.
  toDeploy: string[];
  skippedClean: string[];
};

function deployedOn(deployed: DeployedView, name: string): boolean {
  return deployed.status === "ready" && deployed.names.includes(name);
}

// Deployed here and proven current. Every other reading — behind, lagging a
// tag, un-run — keeps the skill attempted rather than assumed clean.
const isClean = (target: DeploymentTarget, name: string): boolean =>
  deployedOn(target.deployed, name) &&
  target.drift.skillStatus(name) === "up-to-date";

export function planBulkDeploy(
  names: string[],
  targets: DeploymentTarget[],
): BulkDeployPlan {
  const toDeploy: string[] = [];
  const skippedClean: string[] = [];

  for (const name of names) {
    // A single un-run or missing target keeps the skill attempted, not
    // assumed clean (J04).
    const allUpToDate =
      targets.length > 0 && targets.every((target) => isClean(target, name));

    if (allUpToDate) {
      skippedClean.push(name);
      continue;
    }
    toDeploy.push(name);
  }

  return { toDeploy, skippedClean };
}
