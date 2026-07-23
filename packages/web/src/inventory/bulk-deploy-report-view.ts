// Folds a bulk-deploy result into what the report panel renders: the target's
// name, the per-outcome rows, the summary counts, and the overall colour. Pure
// and framework-free, sibling-tested. Colour rule (#292): green when nothing
// went wrong — a clean skip counts as success — and amber on any failure or a
// diverged "attention" skip.

import type { BulkDeployReport, DeploySkillError } from "@maestro/core";

export type BulkReportTone = "success" | "attention";

export type BulkReportCounts = {
  deployed: number;
  skipped: number;
  attention: number;
  failed: number;
};

export type BulkDeployReportView = {
  tone: BulkReportTone;
  targetLabel: string;
  deployed: { name: string; version: string }[];
  skipped: string[];
  attention: { name: string; error: DeploySkillError }[];
  failed: { error: DeploySkillError; names: string[] }[];
  counts: BulkReportCounts;
};

export function bulkDeployReportView(input: {
  report: BulkDeployReport;
  skippedClean: string[];
  targetLabel: string;
}): BulkDeployReportView {
  const { report, skippedClean, targetLabel } = input;

  // A merged failure line carries every affected skill, so the failed count is
  // the sum of those names, not the number of lines.
  const failedCount = report.failed.reduce(
    (total, line) => total + line.names.length,
    0,
  );

  const tone: BulkReportTone =
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
