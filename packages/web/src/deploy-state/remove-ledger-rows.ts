import type {
  ReclaimPreview,
  RemoveOutcome,
  RemoveTargetState,
} from "@maestro/core";
import type { PrimitiveType } from "../inventory/type-filter";
import type { ReportGroup } from "../ui/report";
import type {
  RemoveCheckState,
  RemoveRowWarning,
} from "./remove-preflight-view";
import { toolDisplayName } from "./tool-presentation";

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

const REMOVED_THING: Record<PrimitiveType, string> = {
  skill: "skill",
  hook: "hook",
  mcp: "MCP server",
  bundle: "bundle",
};

export function removeLedgerLeadIn(type: PrimitiveType): string {
  return `Removes the ${REMOVED_THING[type]} from:`;
}

// What a removal leaves alone, and the way back (copy.md → Dialog).
export const REMOVE_KEEPS =
  "The Harness keeps the skill. To add it back, select Deploy skill.";

const OUTCOME_GROUPS: {
  state: RemoveTargetState;
  tone: ReportGroup["tone"];
  label: string;
}[] = [
  { state: "not-removed", tone: "failed", label: "Not removed" },
  // An unproven target may still be there, so the reader checks it.
  { state: "unknown", tone: "attention", label: "Outcome unknown" },
  { state: "removed", tone: "good", label: "Removed" },
];

// The server re-detects tools at execution time, so the card's list only sets
// the order; the heading counts the server's report, never the rows on screen.
export function removeOutcomeReport(
  target: RemoveDialogTarget,
  outcome: RemoveOutcome,
): { heading: string; groups: ReportGroup[] } {
  const targets = targetsOf(target);
  const reported =
    outcome.scope === "repo"
      ? [{ tool: targets[0]?.tool ?? "", state: outcome.state }]
      : outcome.tools;
  const onScreen = targets.map((entry) => entry.tool);
  const ordered = [...reported].sort(
    (a, b) => rank(onScreen, a.tool) - rank(onScreen, b.tool),
  );
  const removed = reported.filter((entry) => entry.state === "removed").length;
  const noun = reported.length === 1 ? "target" : "targets";
  return {
    heading: `Removed from ${removed} of ${reported.length} ${noun}`,
    groups: OUTCOME_GROUPS.map(({ state, tone, label }) => ({
      tone,
      label,
      rows: ordered
        .filter((entry) => entry.state === state)
        .map((entry) =>
          target.kind === "repo"
            ? { name: target.repoPath, mono: true }
            : {
                name:
                  targets.find((each) => each.tool === entry.tool)?.name ??
                  toolDisplayName(entry.tool),
              },
        ),
    })),
  };
}

const rank = (onScreen: readonly string[], tool: string) => {
  const index = onScreen.indexOf(tool);
  return index === -1 ? onScreen.length : index;
};

const targetsOf = (target: RemoveDialogTarget) =>
  target.kind === "repo"
    ? [{ tool: target.repoPath, name: target.repoPath }]
    : target.tools.map((tool) => ({ tool, name: toolDisplayName(tool) }));

export function removeLedgerRows(
  target: RemoveDialogTarget,
  reclaim: readonly ReclaimPreview[],
  check: RemoveCheckState,
): RemoveLedgerRow[] {
  return [
    ...targetsOf(target).map(({ tool, name }) => ({
      key: `target:${name}`,
      name,
      path: null,
      leftover: false,
      ...statusFor(warningForTool(check, tool)),
    })),
    ...reclaim.map((entry) => ({
      key: `leftover:${entry.tool}`,
      name: toolDisplayName(entry.tool),
      path: entry.path,
      status: LEFTOVER_STATUS[warningForTool(check, entry.tool) ?? "none"],
      drift: true,
      leftover: true,
    })),
  ];
}
