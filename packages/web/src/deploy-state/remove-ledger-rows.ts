// What the remove confirmation's ledger states, one row per thing that goes.
import type { ReclaimPreview } from "@maestro/core";
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
};

// A global removal force-deletes the whole copy of any tool this machine no
// longer detects — apm's own uninstall cannot reach it (#339).
const LEFTOVER_STATUS = "not installed — copy deleted in full";

export function removeLedgerRows(
  target: RemoveDialogTarget,
  reclaim: readonly ReclaimPreview[],
): RemoveLedgerRow[] {
  // The global scope keeps the order it was handed: the panel states the set the
  // host detected, and re-sorting it here would make the confirmation disagree
  // with the cards the user just came from.
  const targets =
    target.kind === "repo"
      ? [target.repoPath]
      : target.tools.map((tool) => toolDisplayName(tool));

  return [
    ...targets.map((name) => ({
      key: `target:${name}`,
      name,
      path: null,
      status: null,
      drift: false,
    })),
    // After the detected tools, never among them: these are copies nobody
    // targeted, and the order says so.
    ...reclaim.map((entry) => ({
      key: `leftover:${entry.tool}`,
      name: toolDisplayName(entry.tool),
      path: entry.path,
      status: LEFTOVER_STATUS,
      drift: true,
    })),
  ];
}
