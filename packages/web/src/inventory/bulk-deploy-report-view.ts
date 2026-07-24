// Folds a bulk-deploy result into what the report panel renders: the target's
// name, the per-outcome rows, the summary counts, and the overall colour. Pure
// and framework-free, sibling-tested. Colour rule (#292): green when nothing
// went wrong — a clean skip counts as success — and amber on any failure or a
// diverged "attention" skip.
//
// A distinct "error" tone covers the bulk request itself failing (network or
// HTTP failure, before any report came back) — a discriminated union so a
// consumer can never accidentally read its zeroed-out counts as a real,
// confirmed-clean success.

import type { BulkDeployReport, DeploySkillError } from "@maestro/core";

export type BulkReportCounts = {
  deployed: number;
  skipped: number;
  attention: number;
  failed: number;
};

export type BulkDeployReportView =
  | {
      tone: "success" | "attention";
      targetLabel: string;
      // Successes that were a first install here.
      deployed: { name: string; version: string }[];
      // Successes that replaced a behind copy — the plan's update-to-latest
      // (#292).
      updated: { name: string; version: string }[];
      skipped: string[];
      attention: { name: string; error: DeploySkillError }[];
      failed: { error: DeploySkillError; names: string[] }[];
      counts: BulkReportCounts;
    }
  | {
      tone: "error";
      targetLabel: string;
      // The request's own failure message, for an honest "why" (network
      // outage, server error) rather than a bare "something went wrong".
      message: string;
    };

export function bulkDeployReportView(input: {
  report: BulkDeployReport;
  skippedClean: string[];
  // Names the plan marked as behind before the run. Absent means the caller has
  // no plan to distinguish by, and every success reads as a first deploy.
  updateToLatest?: string[];
  targetLabel: string;
  // The bulk request itself failed (network/HTTP) — `report` carries no real
  // data in this case, so it must never be read.
  requestFailed?: boolean;
  requestFailedMessage?: string;
}): BulkDeployReportView {
  const { report, skippedClean, targetLabel } = input;

  if (input.requestFailed) {
    return {
      tone: "error",
      targetLabel,
      message: input.requestFailedMessage ?? "The deploy request failed.",
    };
  }

  const wasBehind = new Set(input.updateToLatest ?? []);
  const updated = report.deployed.filter((row) => wasBehind.has(row.name));
  const deployed = report.deployed.filter((row) => !wasBehind.has(row.name));

  // A merged failure line carries every affected skill, so the failed count is
  // the sum of those names, not the number of lines.
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
    deployed,
    updated,
    skipped: skippedClean,
    attention: report.attention,
    failed: report.failed,
    counts: {
      // Every success, however it got there — a first install or an update.
      deployed: report.deployed.length,
      skipped: skippedClean.length,
      attention: report.attention.length,
      failed: failedCount,
    },
  };
}
