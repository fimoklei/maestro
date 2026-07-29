// What the remove confirmation's ledger states, one row per thing that goes.
import type { ReclaimPreview } from "@maestro/core";
import { toolDisplayName } from "./tool-labels";

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
};

// apm's own uninstall can't reach an undetected tool's leftover copy (#339).
const LEFTOVER_STATUS = "not installed — copy deleted in full";

export function removeLedgerRows(
  target: RemoveDialogTarget,
  reclaim: readonly ReclaimPreview[],
): RemoveLedgerRow[] {
  // Keeps the order it was handed, or the confirmation would disagree with
  // the cards the user just came from.
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
    // After the detected tools, never among them: nobody targeted these.
    ...reclaim.map((entry) => ({
      key: `leftover:${entry.tool}`,
      name: toolDisplayName(entry.tool),
      path: entry.path,
      status: LEFTOVER_STATUS,
      drift: true,
    })),
  ];
}
