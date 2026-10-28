// What one row's menu holds: every action the stage carries and every
// pull-request link. An absent action is never a disabled one; the Status
// hover card names why it is absent (#1125).

import type { HarnessStageRow, ReviewRequestLink } from "@maestro/core";
import {
  DELETE_LABEL,
  DISCARD_CHANGE,
  EDIT_PROMPT,
  PROPOSE_CHANGE,
  RESTORE_LABEL,
  WITHDRAW_FROM_RELEASE,
  WITHDRAW_PROPOSAL,
} from "../ui/control-labels";
import type { FootItem } from "../ui/foot-actions";
import { openProposalCause } from "./notice-copy";

export type RowActionHandlers = {
  // Takes the row, not the name: two stages carry the press, and a refusal
  // belongs to the one it was made in (#865).
  promote: (row: HarnessStageRow) => void;
  create: (row: HarnessStageRow) => void;
  reopen: (row: HarnessStageRow, number: number) => void;
  // Null where no request is open: the branch alone is withdrawn (#1639).
  withdraw: (row: HarnessStageRow, number: number | null) => void;
  // Takes the row: whether the skill is local-only picks the dialog's copy.
  deleteLocal: (row: HarnessStageRow) => void;
  // Takes the row: its default-branch tree is what the author confirms.
  discard: (row: HarnessStageRow) => void;
  // Takes the commit the menu was painted at: that is the source the author
  // confirms, and a later read must not rewrite it (#915).
  restore: (row: HarnessStageRow, commit: string) => void;
  edit: (row: HarnessStageRow) => void;
  // Takes the row: its Change picks the dialog's copy.
  withdrawFromRelease: (row: HarnessStageRow) => void;
};

// Only over a default-branch copy of an edit: on a skill nothing else holds,
// Delete skill already does the same, and a deletion has Restore skill (#1375).
export const offersDiscard = (
  row: HarnessStageRow,
): row is HarnessStageRow & { remoteTree: string } =>
  row.status === "not-yet-proposed" &&
  row.change !== "deletion" &&
  row.remoteTree !== null;

/** A press of this row that writes at once, from ⋮ or the foot, while it runs. */
export type RunningPress = {
  action: "propose" | "create" | "reopen";
  /** The pull request a reopen names; null for the others. */
  number: number | null;
};

// A null commit takes the item off the menu: there is nothing to confirm.
export type RestoreGate = { enabled: boolean; commit: string | null };

// Numbered only where more than one could be meant: a sole request needs no
// number to be unambiguous.
const named = (label: string, request: ReviewRequestLink, many: boolean) =>
  many ? `${label} #${request.number}` : label;

export function rowItems(
  row: HarnessStageRow,
  handlers: RowActionHandlers,
  enabled: boolean,
  // Edit prompt writes the clone alone, so the remote's silence never closes it.
  editEnabled: boolean,
  // Its own gate: `enabled` closes on the remote's silence, and recovery from
  // the clone's own commit must stay open exactly then (#915).
  restore: RestoreGate,
  running: RunningPress | null,
): FootItem[] {
  const commit = restore.commit;
  const stage = stageItems(row, handlers, enabled, running);
  return [
    ...stage.filter((item) => !item.danger),
    // In every stage, after the stage's own steps: an edit under an open
    // request lands in Pending proposal, where Update proposal sends it on.
    ...(row.type === "prompt" && row.onDisk
      ? [
          {
            label: EDIT_PROMPT,
            disabled: !editEnabled,
            onSelect: () => handlers.edit(row),
          },
        ]
      : []),
    ...stage.filter((item) => item.danger),
    // Last of every menu that carries it. A row that cannot come back shows no
    // item at all, not a disabled one: there is nothing for the author to fix.
    ...(row.restorable && commit !== null
      ? [
          {
            label: RESTORE_LABEL[row.type],
            disabled: !restore.enabled,
            danger: true,
            onSelect: () => handlers.restore(row, commit),
          },
        ]
      : []),
  ];
}

// Last of the stage's items, and red: it deletes files (#994).
function deleteItem(
  row: HarnessStageRow,
  handlers: RowActionHandlers,
  enabled: boolean,
  allowed: boolean,
): FootItem[] {
  return allowed && row.onDisk
    ? [
        {
          label: DELETE_LABEL[row.type],
          disabled: !enabled,
          danger: true,
          onSelect: () => handlers.deleteLocal(row),
        },
      ]
    : [];
}

// Last of the stage's items, and red: it replaces the Working Harness copy.
function withdrawItem(
  row: HarnessStageRow,
  handlers: RowActionHandlers,
  enabled: boolean,
  number: number | null,
): FootItem {
  return {
    label: WITHDRAW_PROPOSAL,
    disabled: !enabled,
    danger: true,
    onSelect: () => handlers.withdraw(row, number),
  };
}

function stageItems(
  row: HarnessStageRow,
  handlers: RowActionHandlers,
  enabled: boolean,
  running: RunningPress | null,
): FootItem[] {
  const busy = (action: RunningPress["action"], number: number | null) =>
    running?.action === action && running.number === number
      ? action
      : undefined;
  const many = row.requests.length > 1;
  const links = row.requests.map((request) => ({
    label: named("View pull request", request, many),
    href: request.url,
  }));
  const sole = row.requests.length === 1 ? row.requests[0] : undefined;

  if (row.stage === "pending-proposal") {
    return [
      // Another contributor's open request holds the branch: local work
      // waits for it to end (#1373).
      ...(row.waitingOn === null
        ? [
            {
              // First, so the next step is one press away (#1045).
              label:
                row.status === "new-local-work"
                  ? "Update proposal"
                  : PROPOSE_CHANGE,
              disabled: !enabled,
              busy: busy("propose", null),
              onSelect: () => handlers.promote(row),
            },
          ]
        : []),
      ...links,
      ...(offersDiscard(row)
        ? [
            {
              label: DISCARD_CHANGE,
              disabled: !enabled,
              danger: true,
              onSelect: () => handlers.discard(row),
            },
          ]
        : []),
      // A local-only skill, or one on the default branch, whose Propose change
      // then carries the deletion to the Curator (#1370). A new skill that is
      // proposed but not merged has nothing on the default branch to delete:
      // Withdraw proposal is its way out.
      ...deleteItem(
        row,
        handlers,
        enabled,
        row.localOnly || row.remoteTree !== null,
      ),
    ];
  }

  // In place of Delete skill or Delete prompt, and red: it replaces or removes
  // the Working Harness copy (#1642).
  if (row.stage === "pending-release") {
    // Two changes to one item never cross: an open proposal, or an unknown
    // read of one, blocks it (#1689).
    const cause = openProposalCause(row.openRequests);
    return [
      ...links,
      {
        label: WITHDRAW_FROM_RELEASE,
        disabled: !enabled || cause !== null,
        danger: true,
        ...(cause === null ? {} : { cause }),
        onSelect: () => handlers.withdrawFromRelease(row),
      },
    ];
  }

  switch (row.status) {
    // Both leave the branch on GitHub with no open request over it, so both
    // offer the one press that opens one. A merge is the normal end of a
    // review: only a missing request can be withdrawn.
    case "proposal-merged":
    case "pull-request-missing":
      return [
        ...links,
        {
          label: "Create pull request",
          disabled: !enabled,
          busy: busy("create", null),
          onSelect: () => handlers.create(row),
        },
        ...(row.status === "pull-request-missing" && row.ownsBranch
          ? [withdrawItem(row, handlers, enabled, null)]
          : []),
      ];
    case "proposal-closed": {
      const reopens = row.requests
        .filter((request) => !request.byOther)
        .map((request) => ({
          label: named("Reopen proposal", request, many),
          disabled: !enabled,
          busy: busy("reopen", request.number),
          onSelect: () => handlers.reopen(row, request.number),
        }));
      const withdraws = row.ownsBranch
        ? [withdrawItem(row, handlers, enabled, null)]
        : [];
      // A deletion opens no proposal dialog, and reopening it once the folder
      // is restored would propose deleting a skill the author kept (#1384).
      if (row.change === "deletion") {
        return [...links, ...(row.onDisk ? [] : reopens), ...withdraws];
      }
      return [
        ...links,
        ...reopens,
        // The way on where reopening is unavailable: a new request over the
        // same branch, which the author sends their current content to.
        {
          label: PROPOSE_CHANGE,
          disabled: !enabled,
          busy: busy("propose", null),
          onSelect: () => handlers.promote(row),
        },
        ...withdraws,
      ];
    }
    case "multiple-pull-requests":
    case "proposed-by-other":
      return links;
    default:
      return sole === undefined
        ? links
        : [...links, withdrawItem(row, handlers, enabled, sole.number)];
  }
}
