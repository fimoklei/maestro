// What the bulk remove states once the run answers (#424). One rule mirrors
// the confirmation it replaces (bulk-remove-dialog-view.ts): a target the run
// came off is a number, a target it left behind is a row with its reason. A
// run that never produced a report states no counts at all — zeroes would read
// as a clean run that removed nothing.

import type {
  BulkRemoveReport,
  RemoveDeployedSkillError,
  RemoveOutcome,
} from "@maestro/core";
import { HttpError } from "../api/http";
import { REFUSAL_REASON } from "./bulk-remove-dialog-view";
import type { BulkRemoveCandidate } from "./bulk-remove-targets";
import { targetQueryKey } from "./use-deploy-skill";

// Never "nothing was removed": a lost answer does not prove the walk never
// ran, and the server removes one target at a time. The pane behind this is
// re-read either way, so the honest instruction is to go and look.
const OUTCOME_UNKNOWN =
  "The run's outcome is unrecorded. Check the targets before removing again.";

// Which class left this target behind. Both words appear on the row: a reason
// alone does not say whether the run refused to try or tried and failed.
type BulkRemoveLeftAloneRow = {
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
  | { kind: "never-started"; label: string; message: string; detail: string }
  // No answer at all. What the run did is unobserved, so it is not stated.
  | { kind: "outcome-unknown"; label: string; message: string; detail: string };

// Terse where the server's own sentence is prose — a report row has one line
// for the reason. Keyed by core's union, so a new error there is a type error
// here rather than a blank row.
const FAILURE_REASON: Record<RemoveDeployedSkillError, string> = {
  "unsupported-primitive-type": "Type cannot be removed",
  "invalid-name": "Unusable skill name",
  "repo-not-registered": "Repository not registered",
  "no-supported-tool": "No supported tool here",
  "not-deployed": "Nothing deployed here",
  "lockfile-malformed": "Deployment record could not be read",
  "ref-unresolvable": "Version could not be resolved",
  "deployed-unreadable": "Deployed copy could not be read",
  "deployed-diverged-from-lock": "Local edits in the deployed copy",
  // Never "its copy changed": the run may have agreed to nothing at all, and a
  // row has no ledger to state what the check found instead (J04, #364).
  "cost-not-acknowledged": "What it would delete was never confirmed",
  "remove-in-progress": "Target held by another operation",
  "manifest-not-recognised": "apm.yml holds an unexpected shape",
  "operation-unfinished": "An earlier change did not finish",
  "remove-incomplete": "Files are still on disk",
  "remove-failed": "Removal not completed by apm",
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
          label: "Run not started",
          message: "Nothing was removed anywhere. Confirm the removal again.",
          detail: "The Maestro server refused the request.",
        }
      : {
          kind: "outcome-unknown",
          label: "Outcome unknown",
          message: OUTCOME_UNKNOWN,
          detail: "The Maestro server did not answer.",
        };
  }
  const report = input.report;
  if (report === undefined) {
    return null;
  }

  const leftAlone = orderedLeftAlone(report, input.targets);
  const total =
    report.removed.length + report.refused.length + report.failed.length;
  const counts = `Removed ${report.removed.length} · refused ${report.refused.length} · failed ${report.failed.length}`;

  if (leftAlone.length === 0) {
    return { kind: "clean", title: { before: "Removed ", after: "" }, counts };
  }
  return {
    kind: "partial",
    title: {
      before: "Removed ",
      after: ` from ${report.removed.length} of ${total} targets`,
    },
    counts,
    leftAlone,
  };
}

// What the server's own probe of the disk found after apm failed, appended to
// the reason. A failed removal can still have taken the copy off: "go and
// look" and "nothing left to do" are opposite instructions. Silence where the
// probe proved nothing — an unanswered probe is not a clean copy (J04).
function probed(outcome: RemoveOutcome | undefined): string {
  if (outcome === undefined) {
    return "";
  }
  // apm removes for every tool at once, so one tool still holding a copy
  // leaves the whole target uncleared.
  const states =
    outcome.scope === "repo"
      ? [outcome.state]
      : outcome.tools.map((entry) => entry.state);
  if (states.includes("not-removed")) {
    return " — still there";
  }
  return states.length > 0 && states.every((state) => state === "removed")
    ? " — gone anyway"
    : "";
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
      reason: `${FAILURE_REASON[row.reason] ?? row.reason}${probed(row.outcome)}`,
    });
  }

  const listed = [...labels.keys()].filter((key) => rows.has(key));
  const unlisted = [...rows.keys()].filter((key) => !labels.has(key));
  return [...listed, ...unlisted].map(
    (key) => rows.get(key) as BulkRemoveLeftAloneRow,
  );
}
