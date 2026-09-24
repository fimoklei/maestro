import type { BulkDeployReport } from "@maestro/core";
import { describe, expect, it, vi } from "vitest";
import {
  type BulkDeployReportView,
  bulkDeployReportGroups,
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

  it("says the selected skills are already up to date rather than showing a row of zeros", () => {
    expect(
      bulkDeploySummary({
        targetLabel: "Global",
        counts: { deployed: 0, skipped: 0, attention: 0, failed: 0 },
      }),
    ).toBe("Deployed to Global · all selected skills are up to date");
  });
});

// The grouping BulkDeployReport used to draw. Its claims moved here when it
// retired into the shared Report (#1038): the words a row carries are decided
// once, where they can be read without rendering anything.
describe("bulkDeployReportGroups", () => {
  const view = (
    overrides: Partial<
      Extract<BulkDeployReportView, { tone: "success" | "attention" }>
    > = {},
  ): Extract<BulkDeployReportView, { tone: "success" | "attention" }> => ({
    tone: "success",
    targetLabel: "Global",
    deployed: [],
    skipped: [],
    attention: [],
    failed: [],
    counts: { deployed: 0, skipped: 0, attention: 0, failed: 0 },
    ...overrides,
  });

  const rowsOf = (
    groups: ReturnType<typeof bulkDeployReportGroups>,
    label: string,
  ) => groups.find((group) => group.label === label)?.rows ?? [];

  it("gives a pinned-per-skill row the reason a single deploy states", () => {
    const groups = bulkDeployReportGroups({
      view: view({
        tone: "attention",
        attention: [
          { name: "tdd", error: "target-pinned-per-skill", forceable: false },
        ],
      }),
    });

    expect(rowsOf(groups, "Attention")[0]?.detail).toContain(
      "Left alone — pinned per skill",
    );
  });

  it("gives a busy row the reason a single deploy states", () => {
    const groups = bulkDeployReportGroups({
      view: view({
        tone: "attention",
        attention: [
          { name: "tdd", error: "deploy-in-progress", forceable: false },
        ],
      }),
    });

    expect(rowsOf(groups, "Attention")[0]?.detail).toContain(
      "A deploy is still running on this target. Wait for it to finish.",
    );
  });

  // The Inventory pane's single deploy reads its refusal here now (#1065), so
  // the linked-folder recovery a single deploy stated stays with it (#748).
  it("gives a linked skill folder the recovery a single deploy states", () => {
    const groups = bulkDeployReportGroups({
      view: view({
        tone: "attention",
        failed: [{ error: "destination-symlinked", names: ["tdd"] }],
      }),
    });

    expect(rowsOf(groups, "Failed")[0]?.detail).toBe(
      "Linked skill folder Delete the linked skill folder in the target, then deploy again.",
    );
  });

  // "Delete the linked skill folder" named no path and no command, so a reader
  // with 47 linked skills could not act on it (#748).
  it("spells out the one rm for the link apm refused", () => {
    const groups = bulkDeployReportGroups({
      view: view({
        tone: "attention",
        failed: [
          {
            error: "destination-symlinked",
            names: ["tdd"],
            linkedPath: "/Users/dev/.claude/skills/tdd",
          },
        ],
      }),
    });

    expect(rowsOf(groups, "Failed")[0]?.detail).toBe(
      "Linked skill folder Run rm /Users/dev/.claude/skills/tdd and then deploy again. This removes the link only. The folder it points at remains on disk.",
    );
  });

  it("names a failure the report carries no recovery step for, never its code", () => {
    const groups = bulkDeployReportGroups({
      view: view({
        tone: "attention",
        failed: [{ error: "no-supported-tool", names: ["tdd"] }],
      }),
    });

    const detail = rowsOf(groups, "Failed")[0]?.detail ?? "";
    expect(detail).toContain("No supported tool");
    expect(detail).not.toContain("no-supported-tool");
  });

  it("carries every skill of a merged failure line on one row", () => {
    const groups = bulkDeployReportGroups({
      view: view({
        tone: "attention",
        failed: [{ error: "auth-required", names: ["tdd", "review"] }],
      }),
    });

    expect(rowsOf(groups, "Failed")[0]?.name).toBe("tdd, review");
  });

  it("offers a force reinstall on a diverged attention row, with its own receipt", () => {
    const onForce = vi.fn();
    const receipt = "b".repeat(64);
    const groups = bulkDeployReportGroups({
      view: view({
        tone: "attention",
        attention: [
          {
            name: "tdd",
            error: "deployed-diverged-from-lock",
            forceable: true,
            copyReceipt: receipt,
          },
        ],
      }),
      onForce,
    });

    const action = rowsOf(groups, "Attention")[0]?.action;
    expect(action?.label).toBe("Deploy tdd again");
    action?.onClick();
    expect(onForce).toHaveBeenCalledWith("tdd", receipt);
  });

  it("offers no way out on a row that is not forceable", () => {
    const groups = bulkDeployReportGroups({
      view: view({
        tone: "attention",
        attention: [
          { name: "tdd", error: "target-pinned-per-skill", forceable: false },
        ],
      }),
      onForce: vi.fn(),
    });

    expect(rowsOf(groups, "Attention")[0]?.action).toBeUndefined();
  });

  // The control is retired with the branch behind it (ADR-0031, #956): a bulk
  // run deploys at the release the target already follows.
  it("has no updated-to-latest group", () => {
    const groups = bulkDeployReportGroups({
      view: view({ deployed: [{ name: "tdd", version: "v1.2.0" }] }),
    });

    expect(groups.map((group) => group.label)).toEqual([
      "Failed",
      "Attention",
      "Already up to date",
      "Deployed",
    ]);
  });
});
