import type { PrimitiveRef, WithdrawFromReleaseError } from "@maestro/core";
import { HARNESS_BUSY } from "../ui/busy-copy";
import {
  rereadLabel,
  WITHDRAW_FROM_RELEASE,
  WITHDRAW_PROPOSAL,
} from "../ui/control-labels";
import type { NoticeContent } from "../ui/notice";
import { noticeFromTable } from "../ui/notice-table";
import { named, phrase } from "../ui/phrase";
import { ITEM_WORDS } from "./item-words";
import {
  deletionHeadings,
  harnessHeadings,
  invalidNameHeading,
  leftAsItWas,
  linkInHarness,
  listOf,
  typeFolderNotRead,
} from "./notice-copy";

type WithdrawalItem = PrimitiveRef & { openRequests: readonly number[] | null };

// Takes the item: a refusal names the one that left Pending release, and the
// pull requests a read found open.
const releaseWithdrawalHeadings = ({
  type,
  name,
  openRequests,
}: WithdrawalItem) => {
  const known = openRequests === null ? null : openProposalCause(openRequests);
  const w = ITEM_WORDS[type];
  const deletion = deletionHeadings(w);
  const again = `select ${WITHDRAW_FROM_RELEASE} again.`;
  return leftAsItWas<WithdrawFromReleaseError>("Nothing was withdrawn.", {
    "not-configured": harnessHeadings["not-configured"],
    "invalid-skill": invalidNameHeading(w),
    "no-answer": {
      level: "error",
      label: "Harness not read",
      message: `Select ${rereadLabel("Harness")}, then ${again}`,
      detail: "Maestro could not read your clone or the latest release.",
    },
    "not-pending-release": {
      level: "error",
      label: "Not under Pending release",
      message: `Select ${rereadLabel("Harness")} to see the ${w.noun} as it is now.`,
      detail: phrase`${named(name)} is no longer under Pending release.`,
    },
    "proposal-open":
      known === null
        ? {
            level: "error",
            label: "Withdrawal blocked",
            message: `Select ${rereadLabel("Harness")} to read GitHub again.`,
            detail: `A pull request for this ${w.noun} is open, or GitHub could not be read.`,
          }
        : { level: "error", label: "Withdrawal blocked", message: known },
    "confirmation-stale": {
      level: "error",
      label: "Confirmation out of date",
      message: `Select ${rereadLabel("Harness")}, then ${again}`,
      detail:
        "Your clone or the latest release changed after this confirmation.",
    },
    "destination-unsafe": linkInHarness(
      w,
      `Replace the link with a real ${w.holder}, then ${again}`,
    ),
    "destination-unreadable": typeFolderNotRead(
      w,
      `Make the Harness ${w.home} readable, then ${again}`,
    ),
    "withdraw-in-progress": {
      level: "error",
      label: HARNESS_BUSY,
      message: `Wait for that change to finish, then ${again}`,
      detail: "Maestro changes one Harness at a time.",
    },
    "withdraw-failed": {
      level: "error",
      label: `${w.Noun} not withdrawn`,
      message: `Make the Harness ${w.home} writable, then ${again}`,
    },
    "sparse-checkout": {
      ...deletion["sparse-checkout"],
      message: "Connect a complete clone to withdraw changes from release.",
      detail: "A partial clone does not hold every file of the Harness.",
    },
    "merge-in-progress": {
      ...deletion["merge-in-progress"],
      message: `Finish or abort the merge, then ${again}`,
      detail: "A half-merged working tree does not state what changed.",
    },
    "rebase-in-progress": {
      ...deletion["rebase-in-progress"],
      message: `Finish or abort the rebase, then ${again}`,
      detail: "A half-rebased working tree does not state what changed.",
    },
    "unresolved-conflicts": {
      ...deletion["unresolved-conflicts"],
      message: `Resolve the conflicts, then ${again}`,
      detail: "A conflicted working tree does not state what changed.",
    },
    unreadable: {
      ...deletion.unreadable,
      message: `Make the Harness folder readable, then ${again}`,
    },
  });
};

/** Why Withdraw from release is blocked, as a tooltip cause; null when nothing blocks it. */
export const openProposalCause = (
  openRequests: readonly number[] | null,
): string | null => {
  if (openRequests === null) {
    return `Select ${rereadLabel("Harness")} to read GitHub again.`;
  }
  if (openRequests.length === 0) {
    return null;
  }
  const requests = openRequests.length === 1 ? "pull request" : "pull requests";
  const numbers = listOf(openRequests.map((number) => `#${number}`));
  return `Merge ${requests} ${numbers} on GitHub, or select ${WITHDRAW_PROPOSAL}.`;
};

export const releaseWithdrawalNotice = (
  error: unknown,
  item: WithdrawalItem,
): NoticeContent | null =>
  noticeFromTable(releaseWithdrawalHeadings(item), error, {
    label: `${ITEM_WORDS[item.type].Noun} not withdrawn`,
    message: `Nothing was withdrawn. The Maestro server did not answer. Select ${WITHDRAW_FROM_RELEASE} again.`,
  });
