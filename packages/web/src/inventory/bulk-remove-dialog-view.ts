// What the bulk remove's confirmation states, grouped by what it costs (#423).
// One rule: a clean target is a number, never a row. A target that costs
// something, or that cannot be touched at all, is a row with its reason on it.
// Nothing else appears, so the weight of the decision is the whole body.

import type {
  RefusalCode,
  RemovePreflightView,
  RemoveRowWarning,
} from "../deploy-state/remove-preflight-view";

export type BulkRemoveCheckedTarget = {
  label: string;
  version: string;
  preflight: RemovePreflightView;
};

export type BulkRemoveCostRow = {
  label: string;
  // Only here: this is the group where "which version am I destroying" is a
  // real question.
  version: string;
  reason: string;
};

export type BulkRemoveRefusalRow = { label: string; reason: string };

export type BulkRemoveDialogView =
  // No target has been priced yet, so no group can be drawn. Answered-of-total
  // rather than a spinner: a slow check reads as progress, not as a hang.
  | { kind: "checking"; line: string }
  | {
      kind: "grouped";
      // Null when nothing is clean — a block with a count of zero is absent,
      // not empty.
      cleanLine: string | null;
      cost: BulkRemoveCostRow[];
      refused: BulkRemoveRefusalRow[];
      // Targets the run will actually walk: the refused ones are skipped by
      // it, so the control names what it does.
      removableCount: number;
      confirmLabel: string;
    };

// Cause — consequence, sized for a right-aligned slot. The last two differ in
// cause, not in price: nothing recorded to check against vs. never checked.
const COST_REASON: Record<Exclude<RemoveRowWarning, "none">, string> = {
  "local-edits": "local edits — deleted too",
  "cannot-verify": "nothing recorded — may lose work",
  "check-failed": "check did not run",
};

// Most certain loss first. A target carrying real edits is priced on those,
// not on a sibling tool nobody could check.
const COST_ORDER: Exclude<RemoveRowWarning, "none">[] = [
  "local-edits",
  "cannot-verify",
  "check-failed",
];

// Terse where the server's own sentence is prose — the row has one line and
// the message is the wrong length for it. An unrecognised code falls back to
// itself rather than to silence.
const REFUSAL_REASON: Record<RefusalCode, string> = {
  "repo-not-registered": "repo not registered",
  "no-supported-tool": "no supported tool here",
  "invalid-name": "not a valid skill name",
  "unsupported-primitive-type": "type cannot be removed",
  "invalid-body": "malformed request",
  // Never a refusal — a check that could not run leaves the removal on offer,
  // and its target is priced under cost instead. Listed so a new code in
  // core's union is a type error here rather than a blank row.
  "preflight-failed": COST_REASON["check-failed"],
};

// What this target costs, or null when the check found nothing to lose. A
// target nobody could check is a cost, never a clean copy (J04).
function costOf(preflight: RemovePreflightView): string | null {
  if (preflight.kind !== "offered") {
    return null;
  }
  const check = preflight.check;
  const perTool =
    check.kind === "per-tool" ? Object.values(check.warnings) : [];
  const warnings: RemoveRowWarning[] =
    check.kind === "per-tool"
      ? // An answer that named no tool measured nothing — an empty map is the
        // absence of a claim, never a clean one (J04).
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
      line: `checking ${targets.length} targets — ${answeredCount} answered`,
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
  // Only when nothing costs and nothing refused: "nothing else goes" is then
  // a statement about the whole panel, not about one block in it.
  const nothingElse = cost.length === 0 && refused.length === 0;

  return {
    kind: "grouped",
    cleanLine:
      cleanCount === 0
        ? null
        : nothingElse
          ? `${cleanCount} clean copies — nothing but the deployed files goes`
          : `${cleanCount} clean copies`,
    cost,
    refused,
    removableCount,
    confirmLabel:
      cost.length === 0
        ? `remove from ${removableCount} →`
        : `remove from ${removableCount} · ${cost.length} lose local edits →`,
  };
}
