import type { RemoveOutcome, RemoveTargetState } from "@maestro/core";
import type { DeployableType } from "../inventory/type-filter";
import { DEPLOY_SKILL } from "../ui/control-labels";
import type { ReportGroup } from "../ui/report";
import { notDetectedNote } from "./deploy-state-copy";
import type {
  RemoveCheckState,
  RemoveRowWarning,
} from "./remove-preflight-view";
import { toolDisplayName } from "./tool-presentation";

export type RemoveDialogTarget =
  // A repo carries its table row's name, so the dialog names it as the row does.
  | { kind: "repo"; repoPath: string; name: string }
  // The Global folders Global writes, listed until the check names its own.
  | { kind: "global"; folders: readonly string[] };

export type RemoveLedgerRow = {
  key: string;
  name: string;
  status: string | null;
  drift: boolean;
  /** A Global folder: muted, with its tool not detected, where Global does not write it. */
  folder?: { muted: false } | { muted: true; note: string };
};

const WARNING_STATUS: Record<Exclude<RemoveRowWarning, "none">, string> = {
  "cannot-verify": "Nothing recorded — may lose work",
  "check-failed": "Check did not run — may lose work",
};

// Before an answer, or where it failed, no row has been checked.
function unansweredWarning(check: RemoveCheckState): RemoveRowWarning | null {
  switch (check.kind) {
    case "unanswered":
      return check.warning === "checking" ? null : "check-failed";
    case "repo":
      return check.warning;
    case "per-folder":
      return "check-failed";
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

const REMOVED_THING: Record<DeployableType, string> = {
  skill: "skill",
  hook: "hook",
  mcp: "MCP server",
  bundle: "bundle",
};

export const removeTitle = (name: string) => `Remove ${name}`;

export const REMOVAL_TARGETS = "Removal targets";

export function removeLedgerLeadIn(type: DeployableType): string {
  return `Removes the ${REMOVED_THING[type]} from:`;
}

// What a removal leaves alone, and the way back (copy.md → Dialog).
export const REMOVE_KEEPS = `The Harness keeps the skill. To add it back, select ${DEPLOY_SKILL}.`;

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
  const reported: readonly { name: string; state: RemoveTargetState }[] =
    outcome.scope === "repo"
      ? [
          {
            name: target.kind === "repo" ? target.name : "",
            state: outcome.state,
          },
        ]
      : outcome.tools.map((entry) => ({
          name: entry.path,
          state: entry.state,
        }));
  const onScreen = target.kind === "repo" ? [target.name] : target.folders;
  const ordered = [...reported].sort(
    (a, b) => rank(onScreen, a.name) - rank(onScreen, b.name),
  );
  const removed = reported.filter((entry) => entry.state === "removed").length;
  const noun =
    outcome.scope === "global"
      ? reported.length === 1
        ? "folder"
        : "folders"
      : reported.length === 1
        ? "target"
        : "targets";
  return {
    heading: `Removed from ${removed} of ${reported.length} ${noun}`,
    groups: OUTCOME_GROUPS.map(({ state, tone, label }) => ({
      tone,
      label,
      rows: ordered
        .filter((entry) => entry.state === state)
        .map((entry) => ({ name: entry.name })),
    })),
  };
}

const rank = (onScreen: readonly string[], name: string) => {
  const index = onScreen.indexOf(name);
  return index === -1 ? onScreen.length : index;
};

export function removeLedgerRows(
  target: RemoveDialogTarget,
  check: RemoveCheckState,
): RemoveLedgerRow[] {
  if (target.kind === "repo") {
    return [
      {
        key: `target:${target.name}`,
        name: target.name,
        ...statusFor(unansweredWarning(check)),
      },
    ];
  }
  if (check.kind !== "per-folder") {
    return target.folders.map((path) =>
      folderRow(path, unansweredWarning(check)),
    );
  }
  // The answer names the folders the removal deletes from; one Global writes
  // that it left out was never checked.
  const answered = check.folders.map((folder) => ({
    ...folderRow(folder.path, folder.warning),
    ...(folder.detected
      ? {}
      : {
          folder: {
            muted: true as const,
            note: notDetectedNote(toolDisplayName(folder.tool)),
          },
        }),
  }));
  const unchecked = target.folders
    .filter((path) => !check.folders.some((folder) => folder.path === path))
    .map((path) => folderRow(path, "check-failed"));
  return [...answered, ...unchecked];
}

const folderRow = (
  path: string,
  warning: RemoveRowWarning | null,
): RemoveLedgerRow => ({
  key: `folder:${path}`,
  name: path,
  ...statusFor(warning),
  folder: { muted: false },
});
