// What the remove confirmation's ledger states, one row per thing that goes.
import type { ReclaimPreview } from "@maestro/core";
import type {
  RemoveCheckState,
  RemoveRowWarning,
} from "./remove-preflight-view";
import { toolDisplayName } from "./tool-labels";

// Which target the removal aims at. The global kind carries its detected tools:
// the user clicked inside one tool's card, and the confirmation is where the
// other tools stop being a surprise (#338).
export type RemoveDialogTarget =
  | { kind: "repo"; repoPath: string }
  | { kind: "global"; tools: string[] };

export type RemoveLedgerRow = {
  key: string;
  // The target itself: a repo path, or a tool's product name.
  name: string;
  // The directory about to be deleted in full, which the tool name alone would
  // hide. Null on a target the removal merely scopes itself to.
  path: string | null;
  // The row's right-hand slot: what is true of this target beyond its name.
  status: string | null;
  // Whether this row costs something the plain removal does not.
  drift: boolean;
  // A copy nobody targeted, which the reclaim deletes whole. Kept apart from
  // `drift` because a targeted row can carry a cost too, and the two lists are
  // announced as separate regions.
  leftover: boolean;
};

// A global removal force-deletes the whole copy of any tool this machine no
// longer detects — apm's own uninstall cannot reach it (#339).
const LEFTOVER_STATUS = "not installed — copy deleted in full";

// Each cost the check can name, stated as cause — consequence in the width a
// right-aligned slot allows. The last two share their consequence and differ in
// their cause, which is the distinction J04 exists to keep: one check ran and
// found no baseline, the other never ran at all.
const WARNING_STATUS: Record<Exclude<RemoveRowWarning, "none">, string> = {
  "local-edits": "local edits — deleted too",
  "cannot-verify": "nothing recorded — may lose work",
  "check-failed": "check didn't run — may lose work",
};

// What the check said about one row, given the answer in hand. A tool the
// answer never mentioned is unchecked, never clean (J04) — the card's detection
// and the check's own can disagree, and a row nobody answered for must not
// borrow the silence of a clean one.
function warningForTool(
  check: RemoveCheckState,
  tool: string,
): RemoveRowWarning | null {
  switch (check.kind) {
    // Still running: an unfinished check has claimed nothing about any row.
    case "unanswered":
      return check.warning === "checking" ? null : "check-failed";
    case "repo":
      return check.warning;
    case "per-tool":
      return check.warnings[tool] ?? "check-failed";
  }
}

function statusFor(warning: RemoveRowWarning | null): {
  status: string | null;
  drift: boolean;
} {
  return warning === null || warning === "none"
    ? { status: null, drift: false }
    : { status: WARNING_STATUS[warning], drift: true };
}

export function removeLedgerRows(
  target: RemoveDialogTarget,
  reclaim: readonly ReclaimPreview[],
  check: RemoveCheckState,
): RemoveLedgerRow[] {
  // The global scope keeps the order it was handed: the panel states the set the
  // host detected, and re-sorting it here would make the confirmation disagree
  // with the cards the user just came from. A repo has one row, so the check's
  // aggregate answer lands there.
  const targets =
    target.kind === "repo"
      ? [{ tool: target.repoPath, name: target.repoPath }]
      : target.tools.map((tool) => ({ tool, name: toolDisplayName(tool) }));

  return [
    ...targets.map(({ tool, name }) => ({
      key: `target:${name}`,
      name,
      path: null,
      leftover: false,
      ...statusFor(warningForTool(check, tool)),
    })),
    // After the detected tools, never among them: these are copies nobody
    // targeted, and the order says so.
    ...reclaim.map((entry) => ({
      key: `leftover:${entry.tool}`,
      name: toolDisplayName(entry.tool),
      path: entry.path,
      status: LEFTOVER_STATUS,
      drift: true,
      leftover: true,
    })),
  ];
}
