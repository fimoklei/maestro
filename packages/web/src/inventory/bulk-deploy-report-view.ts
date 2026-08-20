// Colour (#292): green unless any failure/attention skip. "error" is
// distinct — the bulk request itself failing, zeroed counts never confirmed-clean.

import type { BulkDeployReport, DeploySkillError } from "@maestro/core";

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
      // Successes that were a first install here.
      deployed: { name: string; version: string }[];
      // Successes that replaced a behind copy (#292).
      updated: { name: string; version: string }[];
      skipped: string[];
      attention: BulkDeployReport["attention"];
      failed: { error: DeploySkillError; names: string[] }[];
      counts: BulkReportCounts;
    }
  | {
      tone: "error";
      targetLabel: string;
      message: string;
    };

// Zeroed outcomes are noise: four counts read as a form to decode, where the
// one or two that happened read as a sentence. Severity order, so the half
// that needs the user comes first.
export function bulkDeploySummary(input: {
  targetLabel: string;
  counts: BulkReportCounts;
}): string {
  const { counts } = input;
  const parts = [
    [counts.failed, "failed"],
    [counts.attention, "attention"],
    [counts.deployed, "deployed"],
    [counts.skipped, "skipped"],
  ] as const;
  const named = parts
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`);
  const tail = named.length > 0 ? named.join(" · ") : "nothing to do";
  return `Deployed to ${input.targetLabel} · ${tail}`;
}

export function bulkDeployReportView(input: {
  report: BulkDeployReport;
  skippedClean: string[];
  // Absent means every success reads as a first deploy.
  updateToLatest?: string[];
  targetLabel: string;
  // `report` carries no real data when true — must never be read.
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
    deployed,
    updated,
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
