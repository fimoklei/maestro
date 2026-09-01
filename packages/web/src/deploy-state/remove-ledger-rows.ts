// What the remove confirmation's ledger states, one row per thing that goes.
import type {
  ReclaimPreview,
  RemoveOutcome,
  RemoveTargetState,
} from "@maestro/core";
import type { PrimitiveType } from "../ui/type-tag";
import type {
  RemoveCheckState,
  RemoveRowWarning,
} from "./remove-preflight-view";
import { toolDisplayName } from "./tool-labels";

// Sentence case, not the tag's uppercase — the lead-in is prose. "MCP" keeps
// its capitals because that is the name, not a style.
const TYPE_LABEL: Record<PrimitiveType, string> = {
  skill: "Skill",
  hook: "Hook",
  mcp: "MCP",
  bundle: "Bundle",
};

// Global carries its detected tools: the confirmation is where the other
// tools stop being a surprise (#338).
export type RemoveDialogTarget =
  | { kind: "repo"; repoPath: string }
  | { kind: "global"; tools: string[] };

export type RemoveLedgerRow = {
  key: string;
  name: string;
  // Directory about to be deleted in full. Null on a target the removal
  // merely scopes itself to.
  path: string | null;
  status: string | null;
  drift: boolean;
  // A copy nobody targeted, which the reclaim deletes whole. Kept apart from
  // `drift` because a targeted row can carry a cost too, and the two lists are
  // announced as separate regions.
  leftover: boolean;
  // What the server's own probe proved about this target after a failed
  // removal. Null on a row nobody proved anything about — including every row
  // before the user confirms.
  outcome: RemoveTargetState | null;
};

// apm's own uninstall can't reach an undetected tool's leftover copy (#339).
// What the check found completes the "not installed" sentence — deleting a
// reproducible copy vs. deleting work nothing else holds are different prices (#414).
const LEFTOVER_STATUS: Record<RemoveRowWarning, string> = {
  none: "Not installed — copy deleted in full",
  "local-edits": "Not installed — local edits deleted too",
  "cannot-verify": "Not installed — nothing recorded to check",
  "check-failed": "Not installed — check did not run",
};

// Cause — consequence, sized for a right-aligned slot. The last two share
// their consequence but differ in cause: ran-and-found-nothing vs. never-ran (J04).
const WARNING_STATUS: Record<Exclude<RemoveRowWarning, "none">, string> = {
  "local-edits": "Local edits — deleted too",
  "cannot-verify": "Nothing recorded — may lose work",
  "check-failed": "Check did not run — may lose work",
};

// A tool the answer never mentioned is unchecked, never clean (J04) — a row
// nobody answered for must not borrow the silence of a clean one.
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

// Counted from the server's report, never from the rows on screen: the ledger
// can carry rows apm never reached, and only the report knows which it did.
export function removeLedgerLeadIn(
  outcome: RemoveOutcome | null,
  type: PrimitiveType,
): string {
  if (outcome === null) {
    return `${TYPE_LABEL[type]} will be removed from:`;
  }
  const states =
    outcome.scope === "repo"
      ? [outcome.state]
      : outcome.tools.map((entry) => entry.state);
  const removed = states.filter((state) => state === "removed").length;
  const noun = states.length === 1 ? "target" : "targets";
  return `Removed from ${removed} of ${states.length} ${noun}:`;
}

// One row per target the report answered for — the same set the lead-in counts,
// or the two would disagree. The server detects its tools again at execution
// time, so the card's list is a preference for order, never the set itself.
function outcomeRows(
  outcome: RemoveOutcome,
  targets: readonly { tool: string; name: string }[],
): RemoveLedgerRow[] {
  const reported =
    outcome.scope === "repo"
      ? [{ tool: targets[0]?.tool ?? "", state: outcome.state }]
      : outcome.tools;
  const onScreen = targets.map((entry) => entry.tool);
  return [...reported]
    .sort((a, b) => rank(onScreen, a.tool) - rank(onScreen, b.tool))
    .map((entry) => ({
      key: `target:${entry.tool}`,
      name:
        targets.find((target) => target.tool === entry.tool)?.name ??
        toolDisplayName(entry.tool),
      path: null,
      status: null,
      drift: false,
      leftover: false,
      outcome: entry.state,
    }));
}

// A tool the card never showed sorts after every one it did, in report order.
const rank = (onScreen: readonly string[], tool: string) => {
  const index = onScreen.indexOf(tool);
  return index === -1 ? onScreen.length : index;
};

export function removeLedgerRows(
  target: RemoveDialogTarget,
  reclaim: readonly ReclaimPreview[],
  check: RemoveCheckState,
  // Present only after a removal apm did not confirm. It replaces the costs the
  // rows named, which priced a removal that did not happen.
  outcome: RemoveOutcome | null = null,
): RemoveLedgerRow[] {
  // Keeps the order it was handed, or the confirmation would disagree with
  // the cards the user just came from.
  const targets =
    target.kind === "repo"
      ? [{ tool: target.repoPath, name: target.repoPath }]
      : target.tools.map((tool) => ({ tool, name: toolDisplayName(tool) }));

  if (outcome !== null) {
    return outcomeRows(outcome, targets);
  }

  return [
    ...targets.map(({ tool, name }) => ({
      key: `target:${name}`,
      name,
      path: null,
      leftover: false,
      outcome: null,
      ...statusFor(warningForTool(check, tool)),
    })),
    // After the detected tools, never among them: nobody targeted these.
    ...reclaim.map((entry) => ({
      key: `leftover:${entry.tool}`,
      name: toolDisplayName(entry.tool),
      path: entry.path,
      status: LEFTOVER_STATUS[warningForTool(check, entry.tool) ?? "none"],
      // A cost whatever the check found: the copy goes in full regardless.
      drift: true,
      leftover: true,
      outcome: null,
    })),
  ];
}
