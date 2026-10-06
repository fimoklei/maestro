import type { BulkDeployReport } from "@maestro/core";
import { describe, expect, it, vi } from "vitest";
import { deployNoticeFor } from "../deploy-state/notice-copy";
import { readNotice } from "../test-utils";
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

// Narrows the view to its success/attention branch; only the error-branch test
// expects the "error" tone.
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

  // A bulk run never moves a target's release (#956), so every success is one
  // deploy at the release the target already follows.
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
  it("states how many selected skills reached the target", () => {
    expect(
      bulkDeploySummary({
        targetLabel: "global",
        counts: { deployed: 2, skipped: 1, attention: 1, failed: 3 },
      }),
    ).toBe("Deployed 3 of 7 skills to global");
  });

  it("counts a skill already up to date as having reached the target", () => {
    expect(
      bulkDeploySummary({
        targetLabel: "Global",
        counts: { deployed: 0, skipped: 2, attention: 0, failed: 0 },
      }),
    ).toBe("Deployed 2 of 2 skills to Global");
  });

  it("names one skill in the singular", () => {
    expect(
      bulkDeploySummary({
        targetLabel: "Global",
        counts: { deployed: 1, skipped: 0, attention: 0, failed: 0 },
      }),
    ).toBe("Deployed 1 of 1 skill to Global");
  });
});

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

  const noForce = { run: () => {}, running: null };

  const rowsOf = (
    groups: ReturnType<typeof bulkDeployReportGroups>,
    label: string,
  ) => groups.find((group) => group.label === label)?.rows ?? [];

  it("gives an attention row the whole notice a single deploy states", () => {
    const groups = bulkDeployReportGroups({
      view: view({
        tone: "attention",
        attention: [
          { name: "tdd", error: "target-pinned-per-skill", forceable: false },
        ],
      }),
      force: noForce,
    });

    expect(rowsOf(groups, "Attention")[0]?.notice).toEqual(
      deployNoticeFor("target-pinned-per-skill", undefined),
    );
  });

  it("gives a failed row the whole notice a single deploy states", () => {
    const groups = bulkDeployReportGroups({
      view: view({
        tone: "attention",
        failed: [{ error: "no-supported-tool", names: ["tdd"] }],
      }),
      force: noForce,
    });

    expect(rowsOf(groups, "Failed")[0]?.notice).toEqual({
      label: "No supported tool",
      message:
        "Nothing was installed. Install Claude Code or Codex, then deploy again.",
      detail: "A global deploy installs into Claude Code or Codex.",
    });
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
      force: noForce,
    });

    expect(readNotice(rowsOf(groups, "Failed")[0]?.notice ?? null)).toEqual({
      label: "Linked skill folder",
      message:
        "Nothing was written. Run rm /Users/dev/.claude/skills/tdd and then deploy again.",
      detail:
        "This removes the link only. The folder it points at remains on disk.",
    });
  });

  it("carries every skill of a merged failure line on one row", () => {
    const groups = bulkDeployReportGroups({
      view: view({
        tone: "attention",
        failed: [{ error: "auth-required", names: ["tdd", "review"] }],
      }),
      force: noForce,
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
      force: { run: onForce, running: null },
    });

    const action = rowsOf(groups, "Attention")[0]?.action;
    expect(action?.label).toBe("Deploy tdd again");
    action?.onClick();
    expect(onForce).toHaveBeenCalledWith("tdd", receipt);
  });

  it("shows the running Deploy again busy and locks every other one", () => {
    const diverged = (name: string) => ({
      name,
      error: "deployed-diverged-from-lock" as const,
      forceable: true,
      copyReceipt: "b".repeat(64),
    });
    const groups = bulkDeployReportGroups({
      view: view({
        tone: "attention",
        attention: [diverged("tdd"), diverged("review")],
      }),
      force: { run: vi.fn(), running: "tdd" },
    });

    const [running, other] = rowsOf(groups, "Attention");
    expect(running?.action).toMatchObject({
      label: "Deploying…",
      status: "busy",
    });
    expect(other?.action).toMatchObject({
      label: "Deploy review again",
      status: "locked",
    });
  });

  it("offers no way out on a row that is not forceable", () => {
    const groups = bulkDeployReportGroups({
      view: view({
        tone: "attention",
        attention: [
          { name: "tdd", error: "target-pinned-per-skill", forceable: false },
        ],
      }),
      force: { run: vi.fn(), running: null },
    });

    expect(rowsOf(groups, "Attention")[0]?.action).toBeUndefined();
  });

  // The control is retired: a bulk run deploys at the release the target already
  // follows (#956).
  it("has no updated-to-latest group", () => {
    const groups = bulkDeployReportGroups({
      view: view({ deployed: [{ name: "tdd", version: "v1.2.0" }] }),
      force: noForce,
    });

    expect(groups.map((group) => group.label)).toEqual([
      "Failed",
      "Attention",
      "Already up to date",
      "Deployed",
    ]);
  });
});
