// What the bulk remove's confirmation states, grouped by cost (#423): a clean
// target is a number, a costly or untouchable one is a row with its reason.

import type { RemoveDeployedSkillError } from "@maestro/core";
import { REASON } from "../deploy-state/reason-copy";
import type {
  RefusalCode,
  RemovePreflightView,
  RemoveRowWarning,
} from "../deploy-state/remove-preflight-view";
import type { NoticeCopy } from "../ui/notice";
import {
  bulkRemoveConfirmLabel,
  checkingTargetsLine,
  LOCAL_CHANGES_NEXT_STEP,
  PINNED_LOCAL_CHANGES_NEXT_STEP,
  targetsWithoutLocalEditsNotice,
} from "./inventory-copy";

export type BulkRemoveCheckedTarget = {
  label: string;
  version: string;
  preflight: RemovePreflightView;
};

type BulkRemoveCostRow = {
  label: string;
  // Only here is "which version am I destroying" a real question.
  version: string;
  reason: string;
};

type BulkRemoveRefusalRow = { label: string; reason: string };

export type BulkRemoveDialogView =
  // Answered-of-total rather than a spinner: a slow check reads as progress.
  | { kind: "checking"; line: string }
  | {
      kind: "grouped";
      // Null when nothing is clean: an empty block is absent.
      clean: NoticeCopy | null;
      cost: BulkRemoveCostRow[];
      refused: BulkRemoveRefusalRow[];
      // The way out for the refused targets, where one exists.
      refusedNote: string | null;
      // Refused targets are skipped, so the control names only what it walks.
      removableCount: number;
      confirmLabel: string;
    };

// Cause — consequence, sized for a right-aligned slot. The two differ in
// cause, not in price: nothing recorded to check against vs. never checked.
const COST_REASON: Record<Exclude<RemoveRowWarning, "none">, string> = {
  "cannot-verify": "Nothing recorded — may lose work",
  "check-failed": "Check did not run",
};

// Most certain loss first: a copy the check looked at outranks a sibling tool
// nobody could check.
const COST_ORDER: Exclude<RemoveRowWarning, "none">[] = [
  "cannot-verify",
  "check-failed",
];

export const REFUSAL_REASON: Record<RefusalCode, string> = {
  ...REASON,
  "invalid-body": "Malformed request",
};

// Only local changes have a way out the reader can take here and now.
const NEXT_STEP: Partial<Record<RefusalCode, string>> = {
  "deployed-diverged-from-lock": LOCAL_CHANGES_NEXT_STEP,
  "deployed-diverged-pinned-per-skill": PINNED_LOCAL_CHANGES_NEXT_STEP,
};

/** The next step for the targets left alone with these refusal codes, or null. */
export function localChangesNote(
  codes: readonly (RefusalCode | RemoveDeployedSkillError)[],
): string | null {
  const steps = Object.entries(NEXT_STEP)
    .filter(([code]) => codes.some((each) => each === code))
    .map(([, step]) => step);
  return steps.length === 0 ? null : steps.join(" ");
}

// What this target costs, or null when the check found nothing to lose. A
// target nobody could check is a cost, never a clean copy.
function costOf(preflight: RemovePreflightView): string | null {
  if (preflight.kind !== "offered") {
    return null;
  }
  const check = preflight.check;
  const perTool =
    check.kind === "per-tool" ? Object.values(check.warnings) : [];
  const warnings: RemoveRowWarning[] =
    check.kind === "per-tool"
      ? // An answer that named no tool measured nothing: an empty map is no claim.
        perTool.length === 0
        ? ["check-failed"]
        : perTool
      : check.kind === "repo"
        ? [check.warning]
        : [check.warning === "checking" ? "none" : "check-failed"];

  const worst = COST_ORDER.find((warning) => warnings.includes(warning));
  return worst === undefined ? null : COST_REASON[worst];
}

function isAnswered(preflight: RemovePreflightView): boolean {
  return (
    preflight.kind !== "offered" ||
    preflight.check.kind !== "unanswered" ||
    preflight.check.warning !== "checking"
  );
}

export function bulkRemoveDialogView(
  targets: BulkRemoveCheckedTarget[],
): BulkRemoveDialogView {
  const answeredCount = targets.filter((entry) =>
    isAnswered(entry.preflight),
  ).length;
  if (answeredCount < targets.length) {
    return {
      kind: "checking",
      line: checkingTargetsLine(targets.length, answeredCount),
    };
  }

  const cost: BulkRemoveCostRow[] = [];
  const refused: BulkRemoveRefusalRow[] = [];
  const refusedCodes: RefusalCode[] = [];
  let cleanCount = 0;

  for (const entry of targets) {
    if (entry.preflight.kind === "refused") {
      refusedCodes.push(entry.preflight.code);
      refused.push({
        label: entry.label,
        reason: REFUSAL_REASON[entry.preflight.code],
      });
      continue;
    }
    const reason = costOf(entry.preflight);
    if (reason === null) {
      cleanCount += 1;
      continue;
    }
    cost.push({ label: entry.label, version: entry.version, reason });
  }

  const removableCount = targets.length - refused.length;
  return {
    kind: "grouped",
    clean: cleanCount === 0 ? null : targetsWithoutLocalEditsNotice(cleanCount),
    cost,
    refused,
    refusedNote: localChangesNote(refusedCodes),
    removableCount,
    confirmLabel: bulkRemoveConfirmLabel(removableCount, cost.length),
  };
}
