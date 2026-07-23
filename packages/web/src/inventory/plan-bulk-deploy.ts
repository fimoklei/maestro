// The pre-flight plan for a bulk deploy to one target. Pure and framework-free,
// sibling-tested; the bulk bar reads it to name what will be sent and what is
// skipped as already-done. It skips only a no-op — a skill deployed here AND
// confirmed up-to-date — so a clean-and-latest skill is never shown as work.
// Everything else (not deployed, behind, or a check that could not run) is
// attempted; the deploy path itself refuses a content-diverged copy, which the
// report then surfaces as attention (#292).

import type { DeploymentTarget } from "./deployed-rollup";

export type BulkDeployPlan = {
  // Names to send to the target, in the caller's order.
  toDeploy: string[];
  // Names left out because they are already deployed and up-to-date.
  skippedClean: string[];
  // The subset of toDeploy already deployed here but behind the latest tag: an
  // update, not a first install. Named so the report can say which skills were
  // updated to latest rather than newly deployed (#292).
  updateToLatest: string[];
};

export function planBulkDeploy(
  names: string[],
  target: DeploymentTarget,
): BulkDeployPlan {
  const toDeploy: string[] = [];
  const skippedClean: string[] = [];
  const updateToLatest: string[] = [];

  const deployedHere =
    target.deployed.status === "ready"
      ? new Set(target.deployed.names)
      : new Set<string>();

  for (const name of names) {
    const deployed = deployedHere.has(name);
    const status = target.drift.skillStatus(name);
    // A no-op only when the copy is confirmed present here AND the check that
    // ran says it is up-to-date. Any un-run drift state stays honest and is
    // attempted rather than assumed clean (J04).
    if (deployed && status === "up-to-date") {
      skippedClean.push(name);
      continue;
    }
    toDeploy.push(name);
    // Only a confirmed-behind deployed copy is an update; an un-run check never
    // claims one, and a skill deployed nowhere is a first install.
    if (deployed && status === "behind") {
      updateToLatest.push(name);
    }
  }

  return { toDeploy, skippedClean, updateToLatest };
}
