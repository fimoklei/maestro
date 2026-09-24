import { describe, expect, it } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import type { ReadDriftEntry } from "../drift/use-drift";
import type { DeploymentTarget } from "./deployed-rollup";
import { planBulkDeploy } from "./plan-bulk-deploy";

// One target: confirmed-ready deployed set + drift check listing behind
// skills. A repo target is always alone; global is one per detected tool
// (mirrors use-deployment-targets.ts), since apm tracks installs separately (#292).
function target(
  label: string,
  names: string[],
  behind: ReadDriftEntry[],
): DeploymentTarget {
  return {
    label,
    target: { kind: "global" },
    deployed: { status: "ready", names, skippedCount: 0, attentionCount: 0 },
    primitives: [],
    drift: driftViewModel({ data: { behind }, isError: false }),
  };
}

describe("planBulkDeploy", () => {
  // The Release head answers first (#956): a skill the newest release changed
  // is never "Already up to date", whatever the per-skill drift says. The
  // Inventory pane's single deploy runs through this plan now (#1065).
  it("never skips a skill the newest release changed as clean", () => {
    const onRelease = (changedSkills: string[]): DeploymentTarget => ({
      ...target("Claude Code", ["tdd"], []),
      releaseHead: {
        release: "v0.3.2",
        latestRelease: "v0.3.4",
        changed: changedSkills.length,
        changedSkills,
        selection: ["tdd"],
        selected: 1,
        comparedAt: "2026-09-12T10:00:00.000Z",
      },
    });

    expect(planBulkDeploy(["tdd"], [onRelease(["tdd"])])).toEqual({
      toDeploy: ["tdd"],
      skippedClean: [],
    });
    expect(planBulkDeploy(["tdd"], [onRelease([])])).toEqual({
      toDeploy: [],
      skippedClean: ["tdd"],
    });
  });

  // ADR-0027 §6: the pin still lags, so the skill is not clean. A bulk run
  // deploys it at the target's own release and never claims it moved (#956).
  it("deploys a skill that only lags a tag", () => {
    const targets = [
      target(
        "Claude Code",
        ["tdd"],
        [
          {
            name: "tdd",
            current: "v1.0.0",
            latest: "v1.2.0",
            reading: "older-tag",
          },
        ],
      ),
    ];

    expect(planBulkDeploy(["tdd"], targets)).toEqual({
      toDeploy: ["tdd"],
      skippedClean: [],
    });
  });

  it("deploys a no-longer-released deployment rather than skipping it", () => {
    const plan = planBulkDeploy(
      ["tdd"],
      [
        target(
          "Claude Code",
          ["tdd"],
          [
            {
              name: "tdd",
              current: "v1.0.0",
              latest: "v1.2.0",
              reading: "no-longer-released",
            },
          ],
        ),
      ],
    );

    expect(plan).toEqual({
      toDeploy: ["tdd"],
      skippedClean: [],
    });
  });

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

  it("deploys a deployed-but-behind skill", () => {
    const plan = planBulkDeploy(
      ["tdd"],
      [
        target(
          "global",
          ["tdd"],
          [
            {
              name: "tdd",
              current: "v1.0.0",
              latest: "v1.2.0",
              reading: "behind",
            },
          ],
        ),
      ],
    );

    expect(plan.toDeploy).toEqual(["tdd"]);
    expect(plan.skippedClean).toEqual([]);
  });

  it("keeps only a clean-and-latest skill out of the deploy list", () => {
    const plan = planBulkDeploy(
      ["tdd", "review", "research"],
      [
        target(
          "global",
          ["tdd", "review"],
          [
            {
              name: "review",
              current: "v0.1.0",
              latest: "v0.2.0",
              reading: "behind",
            },
          ],
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

  it("deploys a skill behind on one tool", () => {
    const plan = planBulkDeploy(
      ["tdd"],
      [
        target(
          "Claude Code",
          ["tdd"],
          [
            {
              name: "tdd",
              current: "v1.0.0",
              latest: "v1.2.0",
              reading: "behind",
            },
          ],
        ),
        target("Codex", [], []),
      ],
    );

    expect(plan.toDeploy).toEqual(["tdd"]);
    expect(plan.skippedClean).toEqual([]);
  });

  // A bulk run never moves a target's release (ADR-0031, #956), so no plan
  // entry may read as an update to the latest one.
  it("plans nothing but names to deploy and names already clean", () => {
    const plan = planBulkDeploy(
      ["tdd", "review"],
      [
        target(
          "global",
          ["tdd", "review"],
          [
            {
              name: "review",
              current: "v0.1.0",
              latest: "v0.2.0",
              reading: "behind",
            },
          ],
        ),
      ],
    );

    expect(Object.keys(plan).sort()).toEqual(["skippedClean", "toDeploy"]);
  });
});
