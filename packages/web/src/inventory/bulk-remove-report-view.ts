// What the bulk remove states once the run answers (#424). One rule mirrors
// the confirmation it replaces (bulk-remove-dialog-view.ts): a target the run
// came off is a number, a target it left behind is a row with its reason. A
// run that never produced a report states no counts at all — zeroes would read
// as a clean run that removed nothing.

import type { BulkRemoveReport, RemoveDeployedSkillError } from "@maestro/core";
import { HttpError } from "../api/http";
import { REFUSAL_REASON } from "./bulk-remove-dialog-view";
import type { BulkRemoveCandidate } from "./bulk-remove-targets";
import { targetQueryKey } from "./use-deploy-skill";

// Never "nothing was removed": a lost answer does not prove the walk never
// ran, and the server removes one target at a time. The pane behind this is
// re-read either way, so the honest instruction is to go and look.
const OUTCOME_UNKNOWN =
  "Maestro lost its server's answer and cannot say what was removed. Close this and check the targets before trying again.";

// Which class left this target behind. Both words appear on the row: a reason
// alone does not say whether the run refused to try or tried and failed.
export type BulkRemoveLeftAloneRow = {
  label: string;
  outcome: "refused" | "failed";
  reason: string;
};

export type BulkRemoveReportView =
  // Every target came off. The counts line is the whole body.
  | { kind: "clean"; title: { before: string; after: string }; counts: string }
  | {
      kind: "partial";
      title: { before: string; after: string };
      counts: string;
      leftAlone: BulkRemoveLeftAloneRow[];
    }
  // The server answered before the walk began, so nothing was removed and the
  // same attempt can simply be made again.
  | { kind: "never-started"; label: string; message: string }
  // No answer at all. What the run did is unobserved, so it is not stated.
  | { kind: "outcome-unknown"; label: string; message: string };

// Terse where the server's own sentence is prose — a report row has one line
// for the reason. Keyed by core's union, so a new error there is a type error
// here rather than a blank row.
const FAILURE_REASON: Record<RemoveDeployedSkillError, string> = {
  "unsupported-primitive-type": "type cannot be removed",
  "invalid-name": "not a valid skill name",
  "repo-not-registered": "repo not registered",
  "no-supported-tool": "no supported tool here",
  "not-deployed": "nothing deployed here",
  "lockfile-malformed": "lockfile could not be read",
  "ref-unresolvable": "its version could not be resolved",
  "deployed-unreadable": "deployed copy could not be read",
  "remove-in-progress": "target is held by another operation",
  "remove-failed": "apm did not complete the removal",
};

// The title comes in two halves because the dialog renders the skill's own
// name in mono between them.
export function bulkRemoveReportView(input: {
  targets: readonly BulkRemoveCandidate[];
  report?: BulkRemoveReport;
  error?: unknown;
}): BulkRemoveReportView | null {
  if (input.error !== undefined && input.error !== null) {
    // Only a refusal the server made before walking anything proves nothing
    // was touched. A server that broke may have broken part-way through.
    return input.error instanceof HttpError && input.error.status < 500
      ? {
          kind: "never-started",
          label: "the run never started",
          message: `${input.error.message} Nothing was removed anywhere. Try again.`,
        }
      : {
          kind: "outcome-unknown",
          label: "the outcome is unknown",
          message: OUTCOME_UNKNOWN,
        };
  }
  const report = input.report;
  if (report === undefined) {
    return null;
  }

  const leftAlone = orderedLeftAlone(report, input.targets);
  const total =
    report.removed.length + report.refused.length + report.failed.length;
  const counts = `removed ${report.removed.length} · refused ${report.refused.length} · failed ${report.failed.length}`;

  if (leftAlone.length === 0) {
    return { kind: "clean", title: { before: "Removed ", after: "" }, counts };
  }
  return {
    kind: "partial",
    title: {
      before: "Removed ",
      after: ` from ${report.removed.length} of ${total}`,
    },
    counts,
    leftAlone,
  };
}

// In the order the confirmation listed them, so the rows sit where the user
// just read them. A target the run names but the caller did not list still
// gets a row — under its own key rather than dropped.
function orderedLeftAlone(
  report: BulkRemoveReport,
  targets: readonly BulkRemoveCandidate[],
): BulkRemoveLeftAloneRow[] {
  const labels = new Map(
    targets.map((candidate) => [
      targetQueryKey(candidate.target),
      candidate.label,
    ]),
  );
  const rows = new Map<string, BulkRemoveLeftAloneRow>();

  for (const row of report.refused) {
    const key = targetQueryKey(row.target);
    rows.set(key, {
      label: labels.get(key) ?? key,
      outcome: "refused",
      // A code this build cannot name still says something; a blank slot
      // would read as no reason at all.
      reason: REFUSAL_REASON[row.reason] ?? row.reason,
    });
  }
  for (const row of report.failed) {
    const key = targetQueryKey(row.target);
    rows.set(key, {
      label: labels.get(key) ?? key,
      outcome: "failed",
      reason: FAILURE_REASON[row.reason] ?? row.reason,
    });
  }

  const listed = [...labels.keys()].filter((key) => rows.has(key));
  const unlisted = [...rows.keys()].filter((key) => !labels.has(key));
  return [...listed, ...unlisted].map(
    (key) => rows.get(key) as BulkRemoveLeftAloneRow,
  );
}
