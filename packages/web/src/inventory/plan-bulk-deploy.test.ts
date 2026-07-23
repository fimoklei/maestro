import { describe, expect, it } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import type { VersionDrift } from "../drift/use-drift";
import type { DeploymentTarget } from "./deployed-rollup";
import { planBulkDeploy } from "./plan-bulk-deploy";

// One chosen target the plan reduces against: a confirmed-ready deployed set and
// a drift check that ran, listing the behind skills. Mirrors how the cockpit
// already folds the fast local deploy-state read plus the cached drift check.
function target(names: string[], behind: VersionDrift[]): DeploymentTarget {
  return {
    label: "global",
    deployed: { status: "ready", names, skippedCount: 0 },
    primitives: [],
    drift: driftViewModel({ data: { behind }, isError: false }),
  };
}

describe("planBulkDeploy", () => {
  it("skips a skill already deployed and up-to-date", () => {
    const plan = planBulkDeploy(["tdd"], target(["tdd"], []));

    expect(plan.skippedClean).toEqual(["tdd"]);
    expect(plan.toDeploy).toEqual([]);
  });

  it("deploys a not-yet-deployed skill", () => {
    const plan = planBulkDeploy(["research"], target([], []));

    expect(plan.toDeploy).toEqual(["research"]);
    expect(plan.skippedClean).toEqual([]);
  });

  it("deploys a deployed-but-behind skill as an update", () => {
    const plan = planBulkDeploy(
      ["tdd"],
      target(["tdd"], [{ name: "tdd", current: "v1.0.0", latest: "v1.2.0" }]),
    );

    expect(plan.toDeploy).toEqual(["tdd"]);
    expect(plan.skippedClean).toEqual([]);
  });

  it("keeps only a clean-and-latest skill out of the deploy list", () => {
    const plan = planBulkDeploy(
      ["tdd", "review", "research"],
      target(
        ["tdd", "review"],
        [{ name: "review", current: "v0.1.0", latest: "v0.2.0" }],
      ),
    );

    expect(plan.skippedClean).toEqual(["tdd"]);
    expect(plan.toDeploy).toEqual(["review", "research"]);
  });
});
