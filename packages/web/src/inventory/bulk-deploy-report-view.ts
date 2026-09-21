// Colour (#292): green unless any failure/attention skip. "error" is
// distinct — the bulk request itself failing, zeroed counts never confirmed-clean.

import type { BulkDeployReport, DeploySkillError } from "@maestro/core";
import {
  DEPLOY_STILL_RUNNING,
  deployStateHeading,
  LEFT_ALONE_PINNED,
  RETRY_ON_CARD,
  UPDATE_TO_REACH_RELEASE,
} from "../deploy-state/notice-copy";
import type { ReportGroup } from "../ui/report";

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
  const tail =
    named.length > 0 ? named.join(" · ") : "all selected skills are up to date";
  return `Deployed to ${input.targetLabel} · ${tail}`;
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
    // Never the error's own text: the bulk route answers 200 with a report, so
    // a thrown error is a dropped connection or a request this build got
    // wrong, and neither has a sentence worth showing (ADR-0018).
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

// The row's words come from the deploy notice table, so a code reads the same
// here and in a single deploy's notice, and no code can reach the screen raw.
const RECOVERY: Partial<Record<DeploySkillError, string>> = {
  "target-pinned-per-skill": LEFT_ALONE_PINNED,
  "not-at-target-release": UPDATE_TO_REACH_RELEASE,
  "operation-unfinished": RETRY_ON_CARD,
  "deploy-in-progress": DEPLOY_STILL_RUNNING,
  "deploy-incomplete": RETRY_ON_CARD,
};

const reasonFor = (error: DeploySkillError, packageType?: string) =>
  [
    `${deployStateHeading(error)}${packageType ? ` (${packageType})` : ""}`,
    RECOVERY[error],
  ]
    .filter((part) => part !== undefined)
    .join(" ");

/** The run folded into the Report's groups. Empty groups are not drawn. */
export function bulkDeployReportGroups(input: {
  view: Extract<BulkDeployReportView, { tone: "success" | "attention" }>;
  /** The row's own consent, so an inline deploy grants only what it read. */
  onForce?: (name: string, confirmedCopyReceipt?: string) => void;
}): ReportGroup[] {
  const { view, onForce } = input;
  return [
    {
      tone: "failed",
      label: "Failed",
      rows: view.failed.map((line) => ({
        name: line.names.join(", "),
        detail: reasonFor(line.error),
      })),
    },
    {
      tone: "attention",
      label: "Attention",
      rows: view.attention.map((row) => ({
        name: row.name,
        detail: reasonFor(row.error, row.packageType),
        action:
          onForce && row.forceable
            ? {
                label: `Deploy ${row.name} again`,
                onClick: () => onForce(row.name, row.copyReceipt),
              }
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
