import type {
  ReclaimPreview,
  RemoveOutcome,
  RemoveTargetState,
} from "@maestro/core";
import type { PrimitiveType } from "../inventory/type-filter";
import type {
  RemoveCheckState,
  RemoveRowWarning,
} from "./remove-preflight-view";
import { toolDisplayName } from "./tool-labels";

const TYPE_LABEL: Record<PrimitiveType, string> = {
  skill: "Skill",
  hook: "Hook",
  mcp: "MCP",
  bundle: "Bundle",
};

export type RemoveDialogTarget =
  | { kind: "repo"; repoPath: string }
  | { kind: "global"; tools: string[] };

export type RemoveLedgerRow = {
  key: string;
  name: string;
  // Directory deleted in full; null where the removal only scopes itself.
  path: string | null;
  status: string | null;
  drift: boolean;
  // A copy nobody targeted, which the reclaim deletes whole.
  leftover: boolean;
  // Null on a row nobody proved anything about, including every row before confirm.
  outcome: RemoveTargetState | null;
};

// apm's own uninstall can't reach an undetected tool's leftover copy (#339).
const LEFTOVER_STATUS: Record<RemoveRowWarning, string> = {
  none: "Not installed — copy deleted in full",
  "cannot-verify": "Not installed — nothing recorded to check",
  "check-failed": "Not installed — check did not run",
};

const WARNING_STATUS: Record<Exclude<RemoveRowWarning, "none">, string> = {
  "cannot-verify": "Nothing recorded — may lose work",
  "check-failed": "Check did not run — may lose work",
};

// A tool the answer never mentioned is unchecked, never clean.
function warningForTool(
  check: RemoveCheckState,
  tool: string,
): RemoveRowWarning | null {
  switch (check.kind) {
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

// Counted from the server's report, never the rows on screen: only the report
// knows which targets apm reached.
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

// The same set the lead-in counts. The server re-detects tools at execution
// time, so the card's list only sets the order.
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

const rank = (onScreen: readonly string[], tool: string) => {
  const index = onScreen.indexOf(tool);
  return index === -1 ? onScreen.length : index;
};

export function removeLedgerRows(
  target: RemoveDialogTarget,
  reclaim: readonly ReclaimPreview[],
  check: RemoveCheckState,
  outcome: RemoveOutcome | null = null,
): RemoveLedgerRow[] {
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
    ...reclaim.map((entry) => ({
      key: `leftover:${entry.tool}`,
      name: toolDisplayName(entry.tool),
      path: entry.path,
      status: LEFTOVER_STATUS[warningForTool(check, entry.tool) ?? "none"],
      drift: true,
      leftover: true,
      outcome: null,
    })),
  ];
}
