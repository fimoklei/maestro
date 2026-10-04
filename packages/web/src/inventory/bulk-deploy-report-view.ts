// Colour (#292): green unless any failure/attention skip. "error" is
// distinct — the bulk request itself failing, zeroed counts never confirmed-clean.

import type { BulkDeployReport } from "@maestro/core";
import { deployNoticeFor } from "../deploy-state/notice-copy";
import { ACTIONS } from "../ui/busy-copy";
import { UPDATE_TARGET } from "../ui/control-labels";
import type { ReportGroup, ReportRowAction } from "../ui/report";

type BulkReportCounts = {
  deployed: number;
  skipped: number;
  attention: number;
  failed: number;
};

export type BulkDeployReportView =
  | {
      tone: "success" | "attention";
      targetLabel: string;
      // Every success, at the release the target already follows (#956).
      deployed: { name: string; version: string }[];
      skipped: string[];
      attention: BulkDeployReport["attention"];
      failed: BulkDeployReport["failed"];
      counts: BulkReportCounts;
    }
  | {
      tone: "error";
      targetLabel: string;
      message: string;
    };

// One idea: how many reached the target, a skill already up to date
// included. The groups carry the other counts.
export function bulkDeploySummary(input: {
  targetLabel: string;
  counts: BulkReportCounts;
}): string {
  const { deployed, skipped, attention, failed } = input.counts;
  const total = deployed + skipped + attention + failed;
  return `Deployed ${deployed + skipped} of ${total} ${total === 1 ? "skill" : "skills"} to ${input.targetLabel}`;
}

export function bulkDeployReportView(input: {
  report: BulkDeployReport;
  skippedClean: string[];
  targetLabel: string;
  // `report` carries no real data when true — must never be read.
  requestFailed?: boolean;
}): BulkDeployReportView {
  const { report, skippedClean, targetLabel } = input;

  if (input.requestFailed) {
    // Never the error's own text: the bulk route answers 200 with a report, so a
    // thrown error is a dropped connection or a malformed request.
    return {
      tone: "error",
      targetLabel,
      message:
        "The Maestro server did not answer. Deploy to this target again.",
    };
  }

  // A merged failure line carries every affected skill — sum names, not lines.
  const failedCount = report.failed.reduce(
    (total, line) => total + line.names.length,
    0,
  );

  const tone: "success" | "attention" =
    report.failed.length > 0 || report.attention.length > 0
      ? "attention"
      : "success";

  return {
    tone,
    targetLabel,
    deployed: report.deployed,
    skipped: skippedClean,
    attention: report.attention,
    failed: report.failed,
    counts: {
      deployed: report.deployed.length,
      skipped: skippedClean.length,
      attention: report.attention.length,
      failed: failedCount,
    },
  };
}

type Force = {
  /** The row's own consent, so an inline deploy grants only what it read. */
  run: (name: string, confirmedCopyReceipt?: string) => void;
  /** The skill whose Deploy again is in flight: a second press would send a second deploy (#757). */
  running: string | null;
};

function deployAgain(
  name: string,
  copyReceipt: string | undefined,
  force: Force,
): ReportRowAction {
  const onClick = () => force.run(name, copyReceipt);
  if (force.running === null) return { label: `Deploy ${name} again`, onClick };
  return force.running === name
    ? { label: ACTIONS.deploy.busy, onClick, status: "busy" }
    : { label: `Deploy ${name} again`, onClick, status: "locked" };
}

/** The run folded into the Report's groups. Empty groups are not drawn. */
export function bulkDeployReportGroups(input: {
  view: Extract<BulkDeployReportView, { tone: "success" | "attention" }>;
  force: Force;
  /** Update target priced with this skill: the release move the deploy lacked (#955). */
  onUpdate?: (name: string) => void;
}): ReportGroup[] {
  const { view, force, onUpdate } = input;
  return [
    {
      tone: "failed",
      label: "Failed",
      rows: view.failed.map((line) => ({
        name: line.names.join(", "),
        count: line.names.length,
        notice: deployNoticeFor(line.error, line.linkedPath),
      })),
    },
    {
      tone: "attention",
      label: "Attention",
      rows: view.attention.map((row) => ({
        name: row.name,
        notice: deployNoticeFor(row.error, undefined),
        action: row.forceable
          ? deployAgain(row.name, row.copyReceipt, force)
          : onUpdate && row.error === "not-at-target-release"
            ? { label: UPDATE_TARGET, onClick: () => onUpdate(row.name) }
            : undefined,
      })),
    },
    {
      tone: "neutral",
      label: "Already up to date",
      rows: view.skipped.map((name) => ({ name })),
    },
    {
      tone: "good",
      label: "Deployed",
      rows: view.deployed.map((row) => ({
        name: row.name,
        detail: row.version,
      })),
    },
  ];
}
