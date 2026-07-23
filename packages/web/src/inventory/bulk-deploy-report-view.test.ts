import type { BulkDeployReport } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { bulkDeployReportView } from "./bulk-deploy-report-view";

function report(overrides: Partial<BulkDeployReport>): BulkDeployReport {
  return {
    target: { kind: "global" },
    deployed: [],
    attention: [],
    failed: [],
    ...overrides,
  };
}

describe("bulkDeployReportView", () => {
  it("reads green when everything deployed, even with clean skips", () => {
    const view = bulkDeployReportView({
      report: report({ deployed: [{ name: "tdd", version: "v1.2.0" }] }),
      skippedClean: ["review"],
      targetLabel: "global",
    });

    expect(view.tone).toBe("success");
    expect(view.targetLabel).toBe("global");
    expect(view.skipped).toEqual(["review"]);
    expect(view.deployed).toEqual([{ name: "tdd", version: "v1.2.0" }]);
  });

  it("reads amber when a skill failed", () => {
    const view = bulkDeployReportView({
      report: report({ failed: [{ error: "auth-required", names: ["tdd"] }] }),
      skippedClean: [],
      targetLabel: "global",
    });

    expect(view.tone).toBe("attention");
  });

  it("reads amber when a diverged skill needs attention", () => {
    const view = bulkDeployReportView({
      report: report({
        attention: [{ name: "tdd", error: "deployed-diverged-from-lock" }],
      }),
      skippedClean: [],
      targetLabel: "global",
    });

    expect(view.tone).toBe("attention");
    expect(view.attention).toEqual([
      { name: "tdd", error: "deployed-diverged-from-lock" },
    ]);
  });

  it("counts each outcome for the summary line", () => {
    const view = bulkDeployReportView({
      report: report({
        deployed: [{ name: "tdd", version: "v1.2.0" }],
        attention: [{ name: "review", error: "deployed-diverged-from-lock" }],
        failed: [{ error: "auth-required", names: ["research", "grill"] }],
      }),
      skippedClean: ["docs"],
      targetLabel: "global",
    });

    expect(view.counts).toEqual({
      deployed: 1,
      skipped: 1,
      attention: 1,
      failed: 2,
    });
  });
});
