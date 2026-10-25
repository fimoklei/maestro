import type { PrimitiveRef, WithdrawError } from "@maestro/core";
import { HARNESS_BUSY } from "../ui/busy-copy";
import { rereadLabel, WITHDRAW_PROPOSAL } from "../ui/control-labels";
import type { NoticeContent } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";
import { machine, phrase } from "../ui/phrase";
import { ITEM_WORDS } from "./item-words";
import {
  deletionHeadings,
  invalidNameHeading,
  linkInHarness,
  proposalHeadingsFor,
  typeFolderNotRead,
} from "./notice-copy";
import { defaultBranchCopy } from "./stage-copy";

// A withdrawal stops at the step that failed, so each heading past the first
// step says which steps already ran (#1638).
const withdrawHeadings = ({
  type,
  branch,
  defaultBranch,
  number,
}: WithdrawContext): NoticeTable<WithdrawError> => {
  const w = ITEM_WORDS[type];
  const deletion = deletionHeadings(w);
  const matches = phrase`Your ${w.noun} ${w.holder} now matches its copy on ${defaultBranchCopy(defaultBranch)}.`;
  const replaced = phrase`Your ${w.noun} ${w.holder} matches its copy on ${defaultBranchCopy(defaultBranch)}.`;
  return {
    ...proposalHeadingsFor(w),
    "invalid-skill": invalidNameHeading(w),
    "sparse-checkout": {
      ...deletion["sparse-checkout"],
      message: "Connect a complete clone to withdraw a proposal.",
      detail: "A partial clone does not hold every file of the Harness.",
    },
    "merge-in-progress": {
      ...deletion["merge-in-progress"],
      message: `Finish or abort the merge, then select ${WITHDRAW_PROPOSAL} again.`,
      detail: "A half-merged working tree does not state what changed.",
    },
    "rebase-in-progress": {
      ...deletion["rebase-in-progress"],
      message: `Finish or abort the rebase, then select ${WITHDRAW_PROPOSAL} again.`,
      detail: "A half-rebased working tree does not state what changed.",
    },
    "unresolved-conflicts": {
      ...deletion["unresolved-conflicts"],
      message: `Resolve the conflicts, then select ${WITHDRAW_PROPOSAL} again.`,
      detail: "A conflicted working tree does not state what changed.",
    },
    unreadable: {
      ...deletion.unreadable,
      message: `Make the Harness folder readable, then select ${WITHDRAW_PROPOSAL} again.`,
    },
    "destination-unsafe": linkInHarness(
      w,
      `Replace the link with a real ${w.holder}, then select ${WITHDRAW_PROPOSAL} again.`,
    ),
    "destination-unreadable": typeFolderNotRead(
      w,
      `Make the Harness ${w.home} readable, then select ${WITHDRAW_PROPOSAL} again.`,
    ),
    "push-elsewhere": {
      level: "error",
      label: "Different push remote",
      message: `Point the clone's push remote at its origin, then select ${WITHDRAW_PROPOSAL} again.`,
      detail: "Maestro publishes only to the origin it reads from.",
    },
    "withdraw-in-progress": {
      level: "error",
      label: HARNESS_BUSY,
      message: `Wait for that change to finish, then select ${WITHDRAW_PROPOSAL} again.`,
      detail: "Maestro changes one Harness at a time.",
    },
    "branch-by-other": {
      level: "error",
      label: "Another contributor's commits",
      message: `Only their author can withdraw the proposal. Select ${rereadLabel("Harness")} to read GitHub again.`,
      detail: "A commit on the proposal branch has another author email.",
    },
    "commit-email-missing": {
      level: "error",
      label: "Git email not set",
      message: phrase`Set ${machine("user.email")} in your clone, then select ${WITHDRAW_PROPOSAL} again.`,
    },
    "branch-authors-unknown": {
      level: "error",
      label: "Branch authors not checked",
      message: `Select ${rereadLabel("Harness")}, then select ${WITHDRAW_PROPOSAL} again.`,
      detail: phrase`Maestro could not compare the proposal branch's commit authors with ${machine("user.email")}.`,
    },
    "replace-failed": {
      level: "error",
      label: "Proposal not withdrawn",
      message: `Make the Harness ${w.home} writable, then select ${WITHDRAW_PROPOSAL} again.`,
      detail:
        number === null
          ? "The proposal branch remains unchanged."
          : "The pull request and the proposal branch remain unchanged.",
    },
    "close-failed": {
      level: "error",
      label: "Pull request still open",
      message: `Select ${WITHDRAW_PROPOSAL} again to close it.`,
      detail: phrase`${matches} GitHub did not close the pull request.`,
    },
    "branch-delete-failed": {
      level: "error",
      label: "Proposal branch not deleted",
      message: phrase`Delete ${machine(branch)} on GitHub.`,
      detail:
        number === null
          ? replaced
          : phrase`The pull request is closed. ${replaced}`,
    },
  };
};

/** What a withdrawal's notice names: the item, its branch, its request and the default branch. */
export type WithdrawContext = PrimitiveRef & {
  branch: string;
  defaultBranch: string | null;
  // Null where no request was open to close.
  number: number | null;
};

export const withdrawNotice = (
  error: unknown,
  context: WithdrawContext,
): NoticeContent | null =>
  noticeFromTable(withdrawHeadings(context), error, {
    label: "Proposal not withdrawn",
    message: `The Maestro server did not answer. Select ${rereadLabel("Harness")}, then select ${WITHDRAW_PROPOSAL} again.`,
  });
