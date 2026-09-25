// The pre-flight plan for a bulk deploy. A skill skips as a no-op only once
// confirmed present and up to date on every target (#292). A bulk run never
// moves a target's release, so it plans no update (#956).

import type { DeployedView } from "../deploy-state/deployed-view";
import { type DeploymentTarget, skillReading } from "./deployed-rollup";

export type BulkDeployPlan = {
  // Names to send to the target, in the caller's order.
  toDeploy: string[];
  skippedClean: string[];
};

function deployedOn(deployed: DeployedView, name: string): boolean {
  return deployed.status === "ready" && deployed.names.includes(name);
}

// Deployed here and proven current, the Release head answering first (#956).
const isClean = (target: DeploymentTarget, name: string): boolean =>
  deployedOn(target.deployed, name) &&
  skillReading(target, name) === "up-to-date";

export function planBulkDeploy(
  names: string[],
  targets: DeploymentTarget[],
): BulkDeployPlan {
  const toDeploy: string[] = [];
  const skippedClean: string[] = [];

  for (const name of names) {
    // A single un-run or missing target keeps the skill attempted.
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
