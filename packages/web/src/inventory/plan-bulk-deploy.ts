// The pre-flight plan for a bulk deploy to one destination. Pure and
// framework-free, sibling-tested; the bulk bar reads it to name what will be
// sent and what is skipped as already-done. A destination is one or more
// targets: a repo is always one, but "Global" is one per detected tool (apm
// tracks each tool's install separately) — a skill only skips as a no-op once
// it is confirmed present AND up-to-date on every one of them, so a skill
// missing from a newly-added tool is never mistaken for fully clean (#292).
// Everything else (not deployed everywhere, behind anywhere, or a check that
// could not run) is attempted; the deploy path itself refuses a
// content-diverged copy, which the report then surfaces as attention.

import type { DeployedView } from "../deploy-state/deployed-view";
import type { DeploymentTarget } from "./deployed-rollup";

export type BulkDeployPlan = {
  // Names to send to the target, in the caller's order.
  toDeploy: string[];
  // Names left out because they are already deployed and up-to-date
  // everywhere the destination reaches.
  skippedClean: string[];
  // The subset of toDeploy already deployed somewhere but confirmed behind on
  // at least one target: an update, not a first install. Named so the report
  // can say which skills were updated to latest rather than newly deployed
  // (#292).
  updateToLatest: string[];
};

function deployedOn(deployed: DeployedView, name: string): boolean {
  return deployed.status === "ready" && deployed.names.includes(name);
}

export function planBulkDeploy(
  names: string[],
  targets: DeploymentTarget[],
): BulkDeployPlan {
  const toDeploy: string[] = [];
  const skippedClean: string[] = [];
  const updateToLatest: string[] = [];

  for (const name of names) {
    // A no-op only when every target confirms the copy present AND up-to-date.
    // A single un-run or missing target keeps the skill honest and attempted
    // rather than assumed clean (J04) — this is the multi-tool generalization
    // of the single-target rule.
    const allUpToDate =
      targets.length > 0 &&
      targets.every(
        (target) =>
          deployedOn(target.deployed, name) &&
          target.drift.skillStatus(name) === "up-to-date",
      );
    if (allUpToDate) {
      skippedClean.push(name);
      continue;
    }
    toDeploy.push(name);
    // Only a confirmed-behind deployed copy is an update; an un-run check never
    // claims one, and a skill deployed nowhere is a first install.
    const confirmedBehindSomewhere = targets.some(
      (target) =>
        deployedOn(target.deployed, name) &&
        target.drift.skillStatus(name) === "behind",
    );
    if (confirmedBehindSomewhere) {
      updateToLatest.push(name);
    }
  }

  return { toDeploy, skippedClean, updateToLatest };
}
