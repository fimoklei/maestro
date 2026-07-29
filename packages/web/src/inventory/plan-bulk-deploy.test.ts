import { describe, expect, it } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import type { VersionDrift } from "../drift/use-drift";
import type { DeploymentTarget } from "./deployed-rollup";
import { planBulkDeploy } from "./plan-bulk-deploy";

// One target: confirmed-ready deployed set + drift check listing behind
// skills. A repo target is always alone; global is one per detected tool
// (mirrors use-deployment-targets.ts), since apm tracks installs separately (#292).
function target(
  label: string,
  names: string[],
  behind: VersionDrift[],
): DeploymentTarget {
  return {
    label,
    deployed: { status: "ready", names, skippedCount: 0 },
    primitives: [],
    drift: driftViewModel({ data: { behind }, isError: false }),
  };
}

describe("planBulkDeploy", () => {
  it("skips a skill already deployed and up-to-date", () => {
    const plan = planBulkDeploy(["tdd"], [target("global", ["tdd"], [])]);

    expect(plan.skippedClean).toEqual(["tdd"]);
    expect(plan.toDeploy).toEqual([]);
  });

  it("deploys a not-yet-deployed skill", () => {
    const plan = planBulkDeploy(["research"], [target("global", [], [])]);

    expect(plan.toDeploy).toEqual(["research"]);
    expect(plan.skippedClean).toEqual([]);
  });

  it("deploys a deployed-but-behind skill as an update", () => {
    const plan = planBulkDeploy(
      ["tdd"],
      [
        target(
          "global",
          ["tdd"],
          [{ name: "tdd", current: "v1.0.0", latest: "v1.2.0" }],
        ),
      ],
    );

    expect(plan.toDeploy).toEqual(["tdd"]);
    expect(plan.skippedClean).toEqual([]);
    // A behind copy is an update-to-latest, not a first deploy — named so the
    // report can say which skills were updated rather than newly installed.
    expect(plan.updateToLatest).toEqual(["tdd"]);
  });

  it("does not call a not-yet-deployed skill an update-to-latest", () => {
    const plan = planBulkDeploy(["research"], [target("global", [], [])]);

    expect(plan.toDeploy).toEqual(["research"]);
    expect(plan.updateToLatest).toEqual([]);
  });

  it("keeps only a clean-and-latest skill out of the deploy list", () => {
    const plan = planBulkDeploy(
      ["tdd", "review", "research"],
      [
        target(
          "global",
          ["tdd", "review"],
          [{ name: "review", current: "v0.1.0", latest: "v0.2.0" }],
        ),
      ],
    );

    expect(plan.skippedClean).toEqual(["tdd"]);
    expect(plan.toDeploy).toEqual(["review", "research"]);
  });

  it("deploys a skill missing from one detected tool, even if clean on another", () => {
    // Deployed and up-to-date on Claude Code, but never installed on Codex —
    // a global run must still reach Codex, not read this as fully clean (#292).
    const plan = planBulkDeploy(
      ["tdd"],
      [target("Claude Code", ["tdd"], []), target("Codex", [], [])],
    );

    expect(plan.toDeploy).toEqual(["tdd"]);
    expect(plan.skippedClean).toEqual([]);
  });

  it("skips a skill only once it is clean and latest on every detected tool", () => {
    const plan = planBulkDeploy(
      ["tdd"],
      [target("Claude Code", ["tdd"], []), target("Codex", ["tdd"], [])],
    );

    expect(plan.skippedClean).toEqual(["tdd"]);
    expect(plan.toDeploy).toEqual([]);
  });

  it("calls a skill behind on one tool an update, not a first install", () => {
    const plan = planBulkDeploy(
      ["tdd"],
      [
        target(
          "Claude Code",
          ["tdd"],
          [{ name: "tdd", current: "v1.0.0", latest: "v1.2.0" }],
        ),
        target("Codex", [], []),
      ],
    );

    expect(plan.toDeploy).toEqual(["tdd"]);
    expect(plan.updateToLatest).toEqual(["tdd"]);
  });
});
