// What one row's menu holds: every action the stage carries and every
// pull-request link, plus three blocked actions kept disabled with their reason
// after an em dash. No other absent action becomes a disabled one (#809, #844).
import type { ActionsMenuProps } from "../ui/actions-menu";
import type { HarnessStageRow, ReviewRequestLink } from "./use-harness";

export type RowActionHandlers = {
  // Pushes this skill's working content to its proposal branch, and opens a
  // request where the branch has none. The one press behind both Propose
  // change and Update proposal. It takes the row, not the name: two stages
  // carry the press, and a refusal belongs to the one it was made in (#865).
  promote: (row: HarnessStageRow) => void;
  create: (skill: string) => void;
  reopen: (skill: string, number: number) => void;
  withdraw: (skill: string, number: number) => void;
  // Removes the skill's folder from the Working Harness. Offered only where
  // the skill exists nowhere else, so there is no deletion to propose (#798).
  deleteLocal: (skill: string) => void;
  // Puts the folder back from the clone's last local commit. Local either way,
  // so it is offered on both local stages and survives a silent GitHub (#915).
  // Takes the commit the menu was painted at: that is the source the author
  // confirms, and a later read must not rewrite it (ADR-0030).
  restore: (row: HarnessStageRow, commit: string) => void;
};

// Whether the press is open, and the local commit it would be given against.
// A null commit takes the item off the menu: there is nothing to confirm.
export type RestoreGate = { enabled: boolean; commit: string | null };

const NO_REQUEST = "Withdraw proposal — no request yet";
const EXTRA_UPDATE = "Update proposal — close the extra requests";
const EXTRA_WITHDRAW = "Withdraw proposal — close the extra requests";

// Numbered only where more than one could be meant: a sole request needs no
// number to be unambiguous.
const named = (label: string, request: ReviewRequestLink, many: boolean) =>
  many ? `${label} #${request.number}` : label;

export function rowItems(
  row: HarnessStageRow,
  handlers: RowActionHandlers,
  enabled: boolean,
  // Its own gate: `enabled` closes on the remote's silence, and recovery from
  // the clone's own commit must stay open exactly then (#915).
  restore: RestoreGate,
): ActionsMenuProps["items"] {
  const commit = restore.commit;
  return [
    ...stageItems(row, handlers, enabled),
    // Last of every menu that carries it. A row that cannot come back shows no
    // item at all, not a disabled one: there is nothing for the author to fix.
    ...(row.restorable && commit !== null
      ? [
          {
            label: "Restore skill",
            disabled: !restore.enabled,
            onSelect: () => handlers.restore(row, commit),
          },
        ]
      : []),
  ];
}

function stageItems(
  row: HarnessStageRow,
  handlers: RowActionHandlers,
  enabled: boolean,
): ActionsMenuProps["items"] {
  const many = row.requests.length > 1;
  const links = row.requests.map((request) => ({
    label: named("View pull request", request, many),
    href: request.url,
  }));
  const sole = row.requests.length === 1 ? row.requests[0] : undefined;

  if (row.stage === "pending-proposal") {
    return [
      ...links,
      {
        // The same push either way; the label states which one it is, because
        // sending to an existing proposal is not the same act to the author.
        label:
          row.status === "new-local-work"
            ? "Update proposal"
            : "Propose change",
        disabled: !enabled,
        onSelect: () => handlers.promote(row),
      },
      // Only a skill that has never been proposed and sits in no ref at all:
      // reverting a change to the default branch is a different verb (#798).
      ...(row.status === "not-yet-proposed" && row.localOnly
        ? [
            {
              label: "Delete skill",
              disabled: !enabled,
              onSelect: () => handlers.deleteLocal(row.skill),
            },
          ]
        : []),
    ];
  }

  if (row.stage !== "pending-review") {
    // Merged work: the link is the way to GitHub's own Revert route, and there
    // is no direct undo of merged content.
    return links;
  }

  switch (row.status) {
    // Both leave the branch on GitHub with no open request over it, so both
    // offer the one press that opens one. Withdrawal has nothing to close.
    case "proposal-merged":
    case "pull-request-missing":
      return [
        ...links,
        {
          label: "Create pull request",
          disabled: !enabled,
          onSelect: () => handlers.create(row.skill),
        },
        { label: NO_REQUEST, disabled: true },
      ];
    case "proposal-closed":
      return [
        ...links,
        ...row.requests.map((request) => ({
          label: named("Reopen proposal", request, many),
          disabled: !enabled,
          onSelect: () => handlers.reopen(row.skill, request.number),
        })),
        // The way on where reopening is unavailable: a new request over the
        // same branch, which the author sends their current content to.
        {
          label: "Propose change",
          disabled: !enabled,
          onSelect: () => handlers.promote(row),
        },
      ];
    case "multiple-pull-requests":
      return [
        ...links,
        { label: EXTRA_UPDATE, disabled: true },
        { label: EXTRA_WITHDRAW, disabled: true },
      ];
    default:
      return sole === undefined
        ? links
        : [
            ...links,
            {
              label: "Withdraw proposal",
              disabled: !enabled,
              onSelect: () => handlers.withdraw(row.skill, sole.number),
            },
          ];
  }
}
