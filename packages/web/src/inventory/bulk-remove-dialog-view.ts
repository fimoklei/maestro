// What the bulk remove's confirmation states, grouped by cost (#423): a clean
// target is a number, a costly or untouchable one is a row with its reason.

import { REASON } from "../deploy-state/reason-copy";
import type {
  RefusalCode,
  RemovePreflightView,
  RemoveRowWarning,
} from "../deploy-state/remove-preflight-view";
import { LOCAL_EDITS } from "../deploy-state/target-status";
import type { NoticeCopy } from "../ui/notice";
import { cleanCopiesNotice, removeFromCountLabel } from "./inventory-copy";

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

// An edited copy reads as the detail pane and hover card mark it.
export const REFUSAL_REASON: Record<RefusalCode, string> = {
  ...REASON,
  "deployed-diverged-from-lock": LOCAL_EDITS.word,
  "deployed-diverged-pinned-per-skill": LOCAL_EDITS.word,
  "invalid-body": "Malformed request",
};

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
      line: `Checking ${targets.length} targets — ${answeredCount} answered`,
    };
  }

  const cost: BulkRemoveCostRow[] = [];
  const refused: BulkRemoveRefusalRow[] = [];
  let cleanCount = 0;

  for (const entry of targets) {
    if (entry.preflight.kind === "refused") {
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
  const removeFrom = removeFromCountLabel(removableCount);
  return {
    kind: "grouped",
    clean: cleanCount === 0 ? null : cleanCopiesNotice(cleanCount),
    cost,
    refused,
    removableCount,
    confirmLabel:
      cost.length === 0
        ? removeFrom
        : `${removeFrom} · ${cost.length} may lose work`,
  };
}
