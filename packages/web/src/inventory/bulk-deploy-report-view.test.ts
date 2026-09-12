import type { BulkDeployReport } from "@maestro/core";
import { describe, expect, it } from "vitest";
import {
  type BulkDeployReportView,
  bulkDeployReportView,
  bulkDeploySummary,
} from "./bulk-deploy-report-view";

function report(overrides: Partial<BulkDeployReport>): BulkDeployReport {
  return {
    target: { kind: "global" },
    deployed: [],
    attention: [],
    failed: [],
    ...overrides,
  };
}

// Narrows the view union to its success/attention branch — every test below
// but the dedicated error-branch test drives a real report and never expects
// the distinct "error" tone (#292).
function expectReportView(
  view: BulkDeployReportView,
): Extract<BulkDeployReportView, { tone: "success" | "attention" }> {
  if (view.tone === "error") {
    throw new Error("expected a report view, got the request-failed view");
  }
  return view;
}

describe("bulkDeployReportView", () => {
  it("reads green when everything deployed, even with clean skips", () => {
    const view = expectReportView(
      bulkDeployReportView({
        report: report({ deployed: [{ name: "tdd", version: "v1.2.0" }] }),
        skippedClean: ["review"],
        targetLabel: "global",
      }),
    );

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
    const view = expectReportView(
      bulkDeployReportView({
        report: report({
          attention: [
            {
              name: "tdd",
              error: "deployed-diverged-from-lock",
              forceable: true,
            },
          ],
        }),
        skippedClean: [],
        targetLabel: "global",
      }),
    );

    expect(view.tone).toBe("attention");
    expect(view.attention).toEqual([
      { name: "tdd", error: "deployed-diverged-from-lock", forceable: true },
    ]);
  });

  // A bulk run never moves a target's release (ADR-0031, #956), so every
  // success is one deploy at the release the target already follows.
  it("names every success as a deploy, never as an update to latest", () => {
    const view = expectReportView(
      bulkDeployReportView({
        report: report({
          deployed: [
            { name: "tdd", version: "v1.2.0" },
            { name: "research", version: "v0.3.0" },
          ],
        }),
        skippedClean: [],
        targetLabel: "global",
      }),
    );

    expect(view.deployed).toEqual([
      { name: "tdd", version: "v1.2.0" },
      { name: "research", version: "v0.3.0" },
    ]);
    expect(view.counts.deployed).toBe(2);
  });

  it("reads as a distinct error, never a clean success, when the request itself failed", () => {
    // A request failure must never fall back to a green "0 deployed" report
    // — that reads as success when nothing was confirmed (#292).
    const view = bulkDeployReportView({
      report: report({}),
      skippedClean: ["tdd"],
      targetLabel: "global",
      requestFailed: true,
    });

    expect(view.tone).toBe("error");
    expect(view.targetLabel).toBe("global");
  });

  it("counts each outcome for the summary line", () => {
    const view = expectReportView(
      bulkDeployReportView({
        report: report({
          deployed: [{ name: "tdd", version: "v1.2.0" }],
          attention: [
            {
              name: "review",
              error: "deployed-diverged-from-lock",
              forceable: true,
            },
          ],
          failed: [{ error: "auth-required", names: ["research", "grill"] }],
        }),
        skippedClean: ["docs"],
        targetLabel: "global",
      }),
    );

    expect(view.counts).toEqual({
      deployed: 1,
      skipped: 1,
      attention: 1,
      failed: 2,
    });
  });
});

describe("bulkDeploySummary", () => {
  it("names only the outcomes that happened", () => {
    expect(
      bulkDeploySummary({
        targetLabel: "Global",
        counts: { deployed: 1, skipped: 0, attention: 0, failed: 0 },
      }),
    ).toBe("Deployed to Global · 1 deployed");
  });

  it("keeps every non-zero outcome, in severity order", () => {
    expect(
      bulkDeploySummary({
        targetLabel: "global",
        counts: { deployed: 2, skipped: 1, attention: 1, failed: 3 },
      }),
    ).toBe(
      "Deployed to global · 3 failed · 1 attention · 2 deployed · 1 skipped",
    );
  });

  it("says nothing changed rather than showing a row of zeros", () => {
    expect(
      bulkDeploySummary({
        targetLabel: "Global",
        counts: { deployed: 0, skipped: 0, attention: 0, failed: 0 },
      }),
    ).toBe("Deployed to Global · nothing to do");
  });
});
