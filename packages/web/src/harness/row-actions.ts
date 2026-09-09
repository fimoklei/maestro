// What one row's menu holds: every action the stage carries and every
// pull-request link, plus three blocked actions kept disabled with their reason
// after an em dash. No other absent action becomes a disabled one (#809, #844).
import type { ActionsMenuProps } from "../ui/actions-menu";
import type { HarnessStageRow, ReviewRequestLink } from "./use-harness";

export type RowActionHandlers = {
  // Pushes this skill's working content to its proposal branch, and opens a
  // request where the branch has none. The one press behind both Propose
  // change and Update proposal.
  promote: (skill: string) => void;
  create: (skill: string) => void;
  reopen: (skill: string, number: number) => void;
  withdraw: (skill: string, number: number) => void;
};

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
): ActionsMenuProps["items"] {
  const many = row.requests.length > 1;
  const links = row.requests.map((request) => ({
    label: named("Open pull request", request, many),
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
        onSelect: () => handlers.promote(row.skill),
      },
    ];
  }

  if (row.stage !== "pending-review") {
    // Merged work: the link is the way to GitHub's own Revert route, and there
    // is no direct undo of merged content.
    return links;
  }

  switch (row.status) {
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
          onSelect: () => handlers.promote(row.skill),
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
