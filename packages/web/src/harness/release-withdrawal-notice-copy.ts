import type { HarnessStageRow, WithdrawFromReleaseError } from "@maestro/core";
import { HARNESS_BUSY } from "../ui/busy-copy";
import {
  rereadLabel,
  WITHDRAW_FROM_RELEASE,
  WITHDRAW_PROPOSAL,
} from "../ui/control-labels";
import type { NoticeContent } from "../ui/notice";
import { noticeFromTable } from "../ui/notice-table";
import { named, phrase } from "../ui/phrase";
import { CATEGORIES_NAME, rowWords } from "./item-words";
import {
  deletionHeadings,
  harnessHeadings,
  invalidNameHeading,
  leftAsItWas,
  listOf,
  promoteHeadings,
} from "./notice-copy";

type WithdrawalItem = Pick<
  HarnessStageRow,
  "type" | "name" | "openRequests" | "openByOther"
>;

// The list has no name of its own and every change to it goes at once.
const notPendingDetail = ({ type, name }: WithdrawalItem) =>
  type === "categories"
    ? "No categories change is under Pending release now."
    : phrase`${named(name)} is no longer under Pending release.`;

const unknownOpenDetail = (item: WithdrawalItem) =>
  item.type === "categories"
    ? "A categories pull request is open, or GitHub couldn't be read."
    : `A pull request for this ${rowWords(item.type).noun} is open, or GitHub couldn't be read.`;

const notWithdrawn = (item: WithdrawalItem) =>
  `${item.type === "categories" ? CATEGORIES_NAME : rowWords(item.type).Noun} not withdrawn`;

// Takes the item: a refusal names the one that left Pending release, and the
// pull requests a read found open.
const releaseWithdrawalHeadings = (item: WithdrawalItem) => {
  const known = item.openRequests === null ? null : openProposalCause(item);
  const w = rowWords(item.type);
  const deletion = deletionHeadings(w);
  const promote = promoteHeadings(w);
  const again = `select ${WITHDRAW_FROM_RELEASE} again.`;
  const noun = item.type === "categories" ? "categories" : w.noun;
  const asItIs = item.type === "categories" ? "as they are" : "as it is";
  return leftAsItWas<WithdrawFromReleaseError>("Nothing was withdrawn.", {
    "not-configured": harnessHeadings["not-configured"],
    "invalid-skill": invalidNameHeading(w),
    "no-answer": {
      level: "error",
      label: "Couldn't read the Harness",
      message: `Select ${rereadLabel("Harness")}, then ${again}`,
      detail: "Maestro couldn't read your clone or the latest release.",
    },
    "not-pending-release": {
      level: "error",
      label: "Not under Pending release",
      message: `Select ${rereadLabel("Harness")} to see the ${noun} ${asItIs} now.`,
      detail: notPendingDetail(item),
    },
    "proposal-open":
      known === null
        ? {
            level: "error",
            label: "Withdrawal blocked",
            message: `Select ${rereadLabel("Harness")} to read GitHub again.`,
            detail: unknownOpenDetail(item),
          }
        : { level: "error", label: "Withdrawal blocked", message: known },
    "confirmation-stale": {
      level: "error",
      label: "Confirmation out of date",
      message: `Select ${rereadLabel("Harness")}, then ${again}`,
      detail: "GitHub changed after this confirmation.",
    },
    "clone-not-current": {
      level: "error",
      label: "Clone not up to date",
      message: `Sync your clone with GitHub, then ${again}`,
      detail: "Your clone's last commit isn't the one on GitHub.",
    },
    "push-refused": {
      level: "error",
      label: "Direct push refused",
      message: `Allow direct pushes to the default branch on GitHub, then ${again}`,
      detail: "A rule on GitHub blocked the push.",
    },
    offline: {
      level: "error",
      label: "GitHub didn't respond",
      message: `Select ${WITHDRAW_FROM_RELEASE} again once GitHub is reachable.`,
    },
    "push-elsewhere": {
      ...promote["push-elsewhere"],
      message: "Point the clone's push remote at its origin.",
    },
    "withdraw-in-progress": {
      level: "error",
      label: HARNESS_BUSY,
      message: `Wait for that change to finish, then ${again}`,
      detail: "Maestro changes one Harness at a time.",
    },
    "withdraw-failed": {
      level: "error",
      label: notWithdrawn(item),
      message: `Check that you can push to the default branch on GitHub, then ${again}`,
    },
    "sparse-checkout": {
      ...deletion["sparse-checkout"],
      message: "Connect a complete clone to withdraw changes from release.",
      detail: "A partial clone doesn't hold every file of the Harness.",
    },
    "merge-in-progress": {
      ...deletion["merge-in-progress"],
      message: `Finish or abort the merge, then ${again}`,
      detail: "A half-merged working tree doesn't state what changed.",
    },
    "rebase-in-progress": {
      ...deletion["rebase-in-progress"],
      message: `Finish or abort the rebase, then ${again}`,
      detail: "A half-rebased working tree doesn't state what changed.",
    },
    "unresolved-conflicts": {
      ...deletion["unresolved-conflicts"],
      message: `Resolve the conflicts, then ${again}`,
      detail: "A conflicted working tree doesn't state what changed.",
    },
    unreadable: {
      ...deletion.unreadable,
      message: `Make the Harness folder readable, then ${again}`,
    },
  });
};

/** Why Withdraw from release is blocked, as a tooltip cause; null when nothing blocks it. */
export const openProposalCause = ({
  type,
  openRequests,
  openByOther,
}: Pick<HarnessStageRow, "type" | "openRequests" | "openByOther">):
  | string
  | null => {
  if (openRequests === null) {
    return `Select ${rereadLabel("Harness")} to read GitHub again.`;
  }
  if (openRequests.length === 0) {
    return null;
  }
  const requests = openRequests.length === 1 ? "pull request" : "pull requests";
  const numbers = listOf(openRequests.map((number) => `#${number}`));
  return openByOther || (type === "categories" && openRequests.length > 1)
    ? `Merge or close ${requests} ${numbers} on GitHub.`
    : `Merge ${requests} ${numbers} on GitHub, or select ${WITHDRAW_PROPOSAL}.`;
};

export const releaseWithdrawalNotice = (
  error: unknown,
  item: WithdrawalItem,
): NoticeContent | null =>
  noticeFromTable(releaseWithdrawalHeadings(item), error, {
    label: notWithdrawn(item),
    message: `Nothing was withdrawn. The Maestro server didn't respond. Select ${WITHDRAW_FROM_RELEASE} again.`,
  });
