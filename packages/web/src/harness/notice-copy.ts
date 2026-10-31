import type {
  DiscardChangeError,
  HarnessFreshness,
  HarnessPrimitiveType,
  HarnessStageRead,
  HarnessStateError,
  PrimitiveRef,
  PromoteDeletionError,
  PromoteError,
  ProposalActionError,
  PublishReleaseError,
  ReleasePlanError,
  RestoreError,
} from "@maestro/core";
import { CHANGE_LOCATION_STEP } from "../settings/settings-copy";
import { HARNESS_BUSY } from "../ui/busy-copy";
import {
  CREATE_RELEASE,
  DISCARD_CHANGE,
  PROPOSE_CHANGE,
  PUBLISH_RELEASE,
  rereadLabel,
} from "../ui/control-labels";
import { CLOSE } from "../ui/dialog-copy";
import type { NoticeContent } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";
import { machine, named, phrase } from "../ui/phrase";
import { ROOT_SKILL_FILE } from "./dialog-copy";
import { ITEM_WORDS, type ItemWords } from "./item-words";

// A new code in core fails typecheck here until it has a row.

// The state read's two refusals ride in every other table below: a plan, a
// release and a proposed change all read the same harness first.
export const harnessHeadings: NoticeTable<HarnessStateError> = {
  "not-configured": {
    level: "error",
    label: "No Harness connected",
    message: `${CHANGE_LOCATION_STEP}.`,
  },
  "no-usable-origin": {
    level: "error",
    label: "No GitHub origin",
    message: "Point the clone's origin at the Harness repository on GitHub.",
    detail: "Releases are published as tags, read over https or ssh.",
  },
};

const releasePlanHeadings: NoticeTable<ReleasePlanError> = {
  ...harnessHeadings,
  "no-answer": {
    level: "error",
    label: "GitHub did not respond",
    message: `Select ${rereadLabel("Harness")}, then select ${CREATE_RELEASE} again.`,
    detail: "A release plan is measured against what GitHub holds.",
  },
};

/** A blocked release, said as a tooltip cause and as a refusal heading. */
export const NOTHING_TO_RELEASE = "Nothing to release";

// Delete and Discard change confirm against the next release (#1731).
const STALE_NEXT_RELEASE = "The next release changed after this confirmation.";

const publishReleaseHeadings: NoticeTable<PublishReleaseError> = {
  ...harnessHeadings,
  "no-answer": {
    level: "error",
    label: "GitHub did not respond",
    message: `Nothing was published. Select ${rereadLabel("Harness")}, then select ${PUBLISH_RELEASE} again.`,
  },
  "empty-delta": {
    level: "error",
    label: NOTHING_TO_RELEASE,
    message:
      "Nothing was published. No change has merged since the last release.",
  },
  "root-skill-file": {
    level: "error",
    label: ROOT_SKILL_FILE,
    message:
      "Nothing was published. Remove SKILL.md from the root of the default branch on GitHub.",
  },
  "already-released": {
    level: "error",
    label: "Release already exists",
    message: `Maestro rebuilt the plan against the newest release. Check it, then select ${PUBLISH_RELEASE}.`,
  },
  "plan-changed": {
    level: "error",
    label: "Release plan changed",
    message: `Nothing was published. Maestro rebuilt the plan, so check it, then select ${PUBLISH_RELEASE}.`,
    detail: "GitHub moved while this dialog was open.",
  },
  "publish-failed": {
    level: "error",
    label: "Release not published",
    message: `The Harness is as it was. Select ${PUBLISH_RELEASE} again once GitHub is reachable.`,
  },
  "publish-in-progress": {
    level: "error",
    label: HARNESS_BUSY,
    message: `Wait for that release to finish, then select ${CREATE_RELEASE} again.`,
    detail: "Maestro publishes one release at a time.",
  },
};

// A proposed change and a deletion share a heading wherever they share a code —
// the same thing goes wrong — but each states its own way through, so the
// sentences differ where the two ways through differ (#686).
const oneContributor = (w: ItemWords) =>
  `Only one contributor proposes to a ${w.noun} at a time.`;

/** The name rule's refusal, in the type's own words. */
export const invalidNameHeading = (
  w: ItemWords,
): NoticeTable<"invalid-skill">["invalid-skill"] => ({
  level: "error",
  label: `Unusable ${w.noun} name`,
  message: `A ${w.noun} name uses lowercase letters, digits and single hyphens, like ${w.example}.`,
});

/** A link where Maestro needs a real folder or file, or a linked type folder. */
export const linkInHarness = (
  w: ItemWords,
  message: string,
): NoticeTable<"destination-unsafe">["destination-unsafe"] => ({
  level: "error",
  label: "Link in the Harness",
  message,
  detail: `The ${w.noun} ${w.holder} or the Harness ${w.home} is a link.`,
});

/** A type folder that exists but cannot be read. */
export const typeFolderNotRead = (
  w: ItemWords,
  message: string,
): NoticeTable<"destination-unreadable">["destination-unreadable"] => ({
  level: "error",
  label: `${w.Noun}s folder not read`,
  message,
});

export const promoteHeadings = (w: ItemWords): NoticeTable<PromoteError> => ({
  ...harnessHeadings,
  "invalid-skill": invalidNameHeading(w),
  "no-answer": {
    level: "error",
    label: "GitHub did not respond",
    message: `Nothing was pushed. Select ${rereadLabel("Harness")}, then select ${PROPOSE_CHANGE} again.`,
  },
  "skill-missing": {
    level: "error",
    label: `${w.Noun} no longer in the Harness`,
    message: `Nothing was pushed. Select ${rereadLabel("Harness")} to read the list again.`,
  },
  "destination-unsafe": linkInHarness(
    w,
    `Nothing was pushed. Replace the link with a real ${w.holder}, then select ${PROPOSE_CHANGE} again.`,
  ),
  "push-elsewhere": {
    level: "error",
    label: "Different push remote",
    message: "Nothing was pushed. Point the clone's push remote at its origin.",
    detail: "Maestro publishes only to the origin it reads from.",
  },
  "source-changed": {
    level: "error",
    label: "Files changed during the check",
    message: `Nothing was pushed. Let the edit on disk finish, then select ${PROPOSE_CHANGE} again.`,
  },
  "concurrent-change": {
    level: "error",
    label: "Newer change from a teammate",
    message: `Their version still stands. Pull it into the Harness clone, then select ${PROPOSE_CHANGE} again.`,
  },
  "extra-requests": {
    level: "error",
    label: "Multiple pull requests",
    message: `Nothing was pushed. Select a View pull request link to close the extras, then select ${PROPOSE_CHANGE} again.`,
    detail: `More than one open pull request matches this ${w.noun}'s branch.`,
  },
  "proposed-by-other": {
    level: "error",
    label: "Another contributor's pull request is open",
    message: `Nothing was pushed. Wait until it is merged or closed, then select ${PROPOSE_CHANGE} again.`,
    detail: oneContributor(w),
  },
  "promote-failed": {
    level: "error",
    label: "Change not proposed",
    message: `The Harness is as it was. Select ${PROPOSE_CHANGE} again once GitHub is reachable.`,
  },
  "promote-in-progress": {
    level: "error",
    label: HARNESS_BUSY,
    message: `Wait for that change to finish, then select ${PROPOSE_CHANGE} again.`,
    detail: "Maestro proposes one change at a time.",
  },
});

// Deliberately its own table, not a re-export: a code can refuse two surfaces
// with different words. Where the label holds for both, the row is shared and
// only the way through is rewritten.
export const deletionHeadings = (
  w: ItemWords,
): NoticeTable<PromoteDeletionError> => {
  const promote = promoteHeadings(w);
  const DELETE = w.deleteLabel;
  return {
    ...harnessHeadings,
    "invalid-skill": promote["invalid-skill"],
    "push-elsewhere": promote["push-elsewhere"],
    "no-answer": {
      ...promote["no-answer"],
      message: `Nothing was pushed. Select ${rereadLabel("Harness")}, then select ${DELETE} again.`,
    },
    "source-changed": {
      ...promote["source-changed"],
      message: `Nothing was pushed. Select ${rereadLabel("Harness")} to read the list again.`,
    },
    "promote-in-progress": {
      ...promote["promote-in-progress"],
      message: `Wait for that change to finish, then select ${DELETE} again.`,
    },
    "promote-failed": {
      ...promote["promote-failed"],
      label: "Deletion not proposed",
      message: `The Harness is as it was. Select ${DELETE} again once GitHub is reachable.`,
    },
    "extra-requests": {
      ...promote["extra-requests"],
      message: `Nothing was pushed. Select a View pull request link to close the extras, then select ${DELETE} again.`,
    },
    "proposed-by-other": {
      ...promote["proposed-by-other"],
      message: `Nothing was pushed. Wait until it is merged or closed, then select ${DELETE} again.`,
    },
    "confirmation-stale": {
      level: "error",
      label: "Confirmation out of date",
      message: `Nothing was pushed. Select ${rereadLabel("Harness")}, then select ${DELETE} again.`,
      detail: STALE_NEXT_RELEASE,
    },
    "not-deleted": {
      level: "error",
      label: `${w.Noun} still in the Harness`,
      message: `Delete the ${w.noun} ${w.holder} in the Harness clone first.`,
      detail:
        "A deletion publishes what the Harness working tree already says.",
    },
    "sparse-checkout": {
      level: "error",
      label: "Partial clone",
      message: `Nothing was pushed. Connect a complete clone to delete ${w.noun}s.`,
      detail: `A missing ${w.holder} in a partial clone is not proof of a deletion.`,
    },
    "merge-in-progress": {
      level: "error",
      label: "Unfinished merge",
      message: `Nothing was pushed. Finish or abort the merge, then select ${DELETE} again.`,
      detail: "A half-merged working tree does not state what should go.",
    },
    "rebase-in-progress": {
      level: "error",
      label: "Unfinished rebase",
      message: `Nothing was pushed. Finish or abort the rebase, then select ${DELETE} again.`,
      detail: "A half-rebased working tree does not state what should go.",
    },
    "unresolved-conflicts": {
      level: "error",
      label: "Unresolved conflicts",
      message: `Nothing was pushed. Resolve the conflicts, then select ${DELETE} again.`,
      detail: "A conflicted working tree does not state what should go.",
    },
    unreadable: {
      level: "error",
      label: "Working tree not read",
      message: `Nothing was pushed. Make the Harness folder readable, then select ${DELETE} again.`,
    },
  };
};

// Every refusal leaves the working tree as it was, so every sentence opens by
// saying so, written once over the whole table (#915).
export const leftAsItWas = <E extends string>(
  opening: string,
  table: NoticeTable<E>,
): NoticeTable<E> =>
  Object.fromEntries(
    Object.entries<NoticeContent>(table).map(([code, notice]) => [
      code,
      { ...notice, message: phrase`${opening} ${notice.message}` },
    ]),
  ) as NoticeTable<E>;

const restorationHeadings = (w: ItemWords): NoticeTable<RestoreError> => {
  const deletion = deletionHeadings(w);
  const RESTORE = w.restoreLabel;
  return leftAsItWas<RestoreError>("Nothing was restored.", {
    "not-configured": harnessHeadings["not-configured"],
    "invalid-skill": invalidNameHeading(w),
    "head-moved": {
      level: "error",
      label: "Confirmation out of date",
      message: `Select ${rereadLabel("Harness")}, then select ${RESTORE} again.`,
      detail: "Your clone's last commit moved after this confirmation.",
    },
    "staged-changes": {
      level: "error",
      label: `${w.Noun} has staged changes`,
      message: `Unstage this ${w.noun} in your Git tool, then select ${RESTORE} again.`,
      detail: "Maestro never changes what you staged.",
    },
    "not-in-commit": {
      level: "error",
      label: `${w.Noun} not in your last commit`,
      message: `Recover the ${w.holder} in your Git tool instead.`,
      detail: "Maestro restores only what your last local commit holds.",
    },
    "destination-exists": {
      level: "error",
      label: `${w.Holder} already there`,
      message: `Move the ${w.holder} in the Harness clone, then select ${RESTORE} again.`,
      detail: `Something already sits where this ${w.noun} ${w.holder} belongs.`,
    },
    "destination-unsafe": linkInHarness(
      w,
      `Replace the link with a real ${w.holder}, then select ${RESTORE} again.`,
    ),
    "restore-in-progress": {
      level: "error",
      label: HARNESS_BUSY,
      message: `Wait for that change to finish, then select ${RESTORE} again.`,
      detail: "Maestro changes one Harness at a time.",
    },
    "restore-failed": {
      level: "error",
      label: `${w.Noun} not restored`,
      message: `Make the Harness ${w.home} writable, then select ${RESTORE} again.`,
    },
    // A working tree mid-operation does not say what is missing, so the same
    // headings a deletion refuses under stand here, with the way on rewritten.
    "sparse-checkout": {
      ...deletion["sparse-checkout"],
      message: `Connect a complete clone to restore ${w.noun}s.`,
    },
    "merge-in-progress": {
      ...deletion["merge-in-progress"],
      message: `Finish or abort the merge, then select ${RESTORE} again.`,
      detail: "A half-merged working tree does not state what is missing.",
    },
    "rebase-in-progress": {
      ...deletion["rebase-in-progress"],
      message: `Finish or abort the rebase, then select ${RESTORE} again.`,
      detail: "A half-rebased working tree does not state what is missing.",
    },
    "unresolved-conflicts": {
      ...deletion["unresolved-conflicts"],
      message: `Resolve the conflicts, then select ${RESTORE} again.`,
      detail: "A conflicted working tree does not state what is missing.",
    },
    unreadable: {
      ...deletion.unreadable,
      message: `Make the Harness folder readable, then select ${RESTORE} again.`,
    },
    // A read that failed is never proof the copy is absent, so the sentence
    // sends the author to their Git tool rather than naming a missing item.
    "source-unreadable": {
      level: "error",
      label: "Committed copy not read",
      message: `Check the Harness clone with your Git tool, then select ${RESTORE} again.`,
      detail: `Maestro could not read this ${w.noun} out of your last local commit.`,
    },
    "destination-unreadable": {
      level: "error",
      label: `${w.Noun}s folder missing`,
      message: `Put the ${w.home} back in the Harness clone, then select ${RESTORE} again.`,
      detail: `Maestro could not read the Harness ${w.home}.`,
    },
  });
};

// Takes the item: a refusal names which one moved on (#1375).
const discardHeadings = ({ type, name }: PrimitiveRef) => {
  const w = ITEM_WORDS[type];
  const deletion = deletionHeadings(w);
  return leftAsItWas<DiscardChangeError>("Nothing was discarded.", {
    "not-configured": harnessHeadings["not-configured"],
    "invalid-skill": invalidNameHeading(w),
    "no-answer": {
      level: "error",
      label: "Clone not read",
      message: `Select ${CLOSE}, then select ${DISCARD_CHANGE} again.`,
      detail: "Git could not read your clone.",
    },
    "already-proposed": {
      level: "error",
      label: "Change already proposed",
      message: `Select ${rereadLabel("Harness")} to see the ${w.noun} as it is now.`,
      detail: phrase`${named(name)} now has a proposal branch or pull request.`,
    },
    "nothing-to-discard": {
      level: "error",
      label: "Nothing to discard",
      message: `Select ${rereadLabel("Harness")} to see the ${w.noun} as it is now.`,
      detail: phrase`${named(name)} has no change that waits for a proposal.`,
    },
    "confirmation-stale": {
      level: "error",
      label: "Confirmation out of date",
      message: `Select ${rereadLabel("Harness")}, then select ${DISCARD_CHANGE} again.`,
      detail: STALE_NEXT_RELEASE,
    },
    "destination-unsafe": linkInHarness(
      w,
      `Replace the link with a real ${w.holder}, then select ${DISCARD_CHANGE} again.`,
    ),
    "destination-unreadable": typeFolderNotRead(
      w,
      `Make the Harness ${w.home} readable, then select ${DISCARD_CHANGE} again.`,
    ),
    "discard-in-progress": {
      level: "error",
      label: HARNESS_BUSY,
      message: `Wait for that change to finish, then select ${DISCARD_CHANGE} again.`,
      detail: "Maestro changes one Harness at a time.",
    },
    "discard-failed": {
      level: "error",
      label: "Change not discarded",
      message: `Make the Harness ${w.home} writable, then select ${DISCARD_CHANGE} again.`,
    },
    "sparse-checkout": {
      ...deletion["sparse-checkout"],
      message: "Connect a complete clone to discard changes.",
      detail: "A partial clone does not hold every file of the Harness.",
    },
    "merge-in-progress": {
      ...deletion["merge-in-progress"],
      message: `Finish or abort the merge, then select ${DISCARD_CHANGE} again.`,
      detail: "A half-merged working tree does not state what changed.",
    },
    "rebase-in-progress": {
      ...deletion["rebase-in-progress"],
      message: `Finish or abort the rebase, then select ${DISCARD_CHANGE} again.`,
      detail: "A half-rebased working tree does not state what changed.",
    },
    "unresolved-conflicts": {
      ...deletion["unresolved-conflicts"],
      message: `Resolve the conflicts, then select ${DISCARD_CHANGE} again.`,
      detail: "A conflicted working tree does not state what changed.",
    },
    unreadable: {
      ...deletion.unreadable,
      message: `Make the Harness folder readable, then select ${DISCARD_CHANGE} again.`,
    },
  });
};

/** Joins parts as running text: "a", "a and b", "a, b and c". */
export const listOf = (parts: readonly string[]): string =>
  parts.length < 2
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

// Each refusal leaves the pull request and the clone as they were, so every
// sentence ends on another press of the same control.
export const proposalHeadingsFor = (
  w: ItemWords,
): NoticeTable<ProposalActionError> => ({
  ...harnessHeadings,
  "invalid-skill": invalidNameHeading(w),
  "no-answer": {
    level: "error",
    label: "GitHub did not respond",
    message: `Nothing changed on GitHub. Select ${rereadLabel("Harness")}.`,
    detail:
      "Maestro could not read the branch this proposal is opened against.",
  },
  "review-unavailable": {
    level: "error",
    label: "Review status unavailable",
    message: `Sign in with gh auth login, then select ${rereadLabel("Harness")}.`,
    detail: "Maestro reads pull requests through your own gh sign-in.",
  },
  "review-unknown": {
    level: "error",
    label: "Review status unknown",
    message: `Select ${rereadLabel("Harness")} to read GitHub again.`,
    detail: "GitHub gave no answer Maestro can act on.",
  },
  "request-gone": {
    level: "error",
    label: "Pull request moved on",
    message: `Select ${rereadLabel("Harness")} to read what GitHub holds now.`,
    detail: `This pull request is no longer the one open over this ${w.noun}.`,
  },
  "extra-requests": {
    level: "error",
    label: "Multiple pull requests",
    message: `Select a View pull request link to close the extras, then select ${rereadLabel("Harness")}.`,
    detail: `More than one open pull request matches this ${w.noun}'s branch.`,
  },
  "proposed-by-other": {
    level: "error",
    label: "Another contributor's pull request",
    message: `Only its author can change it. Select ${rereadLabel("Harness")} to read GitHub again.`,
    detail: oneContributor(w),
  },
  "request-exists": {
    level: "error",
    label: "Pull request already open",
    message: `Select ${rereadLabel("Harness")} to read the open pull request.`,
    detail: `GitHub already holds an open request over this ${w.noun}'s branch.`,
  },
  "action-failed": {
    level: "error",
    label: "Pull request unchanged",
    message: "Open the pull request on GitHub and make the change there.",
    detail: "GitHub refused the change Maestro asked for.",
  },
});

const proposalHeadings = proposalHeadingsFor(ITEM_WORDS.skill);

// Info, not warning: a warning is a way through at a cost, and pulling the
// teammate's change is the only way here (#465).
export const CONCURRENT_CHANGE_NOTICE: NoticeContent = {
  ...promoteHeadings(ITEM_WORDS.skill)["concurrent-change"],
  level: "info",
};

// One fallback per surface: a failure no row covers still costs each of these
// something different, and the sentence says which (#688).
export const harnessStateNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(harnessHeadings, error, {
    label: "Harness not read",
    message: `The Maestro server did not answer. Select ${rereadLabel("Harness")} to read the Harness again.`,
  });

export const refreshNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(harnessHeadings, error, {
    label: "GitHub not read",
    message: `The Maestro server did not answer, so the Harness is as it was. Select ${rereadLabel("Harness")}.`,
  });

// Null before any read has ever succeeded: nothing is out of date yet (#848).
export const staleStatusNotice = (
  freshness: HarnessFreshness,
  onRetry: () => void,
): NoticeContent | null => {
  if (
    freshness.lastFetchedAt === null ||
    (freshness.outcome !== "offline" && freshness.outcome !== "fetch-failed")
  ) {
    return null;
  }
  return {
    level: "warning",
    label: "Status out of date",
    message: `Select ${rereadLabel("Harness")} to read GitHub again.`,
    detail:
      freshness.outcome === "offline"
        ? "Maestro could not reach GitHub, so these rows are from the last read."
        : "GitHub gave no answer, so these rows are from the last read.",
    action: { label: rereadLabel("Harness"), onClick: onRetry },
  };
};

// Warning, not error: the rest of the picture stands, and one more read is a
// way through (#866).
export const stageReadNotice = (
  read: HarnessStageRead,
  label: string,
  onRetry: () => void,
): NoticeContent | null => {
  if (read.outcome === "read") {
    return null;
  }
  const cause =
    read.outcome === "unavailable"
      ? proposalHeadings["review-unavailable"]
      : proposalHeadings["review-unknown"];
  return {
    level: "warning",
    label,
    message: cause.message,
    detail: cause.detail,
    action: { label: rereadLabel("Harness"), onClick: onRetry },
  };
};

// A full publish is a toast. The tag is atomic, so only the Inventory re-read
// can fail on its own, and that half outcome needs an action (#849).
export const releasePublishedNotice = (
  tag: string,
  onReread: () => void,
): NoticeContent => ({
  level: "warning",
  label: "Release published",
  message: phrase`Maestro tagged ${machine(tag)}, but Inventory was not read. Select ${rereadLabel("Skills")} to see the published skills.`,
  detail: "A release cannot change after publication.",
  action: { label: rereadLabel("Skills"), onClick: onReread },
});

export const releasePlanNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(releasePlanHeadings, error, {
    label: "Release plan not read",
    message:
      "The Maestro server did not answer, so no version was worked out. Open the release again.",
  });

export const publishReleaseNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(publishReleaseHeadings, error, {
    label: "Release not published",
    message: `The Maestro server did not answer, and no tag was pushed. Select ${PUBLISH_RELEASE} again.`,
  });

export const promoteNotice = (
  error: unknown,
  type: HarnessPrimitiveType,
): NoticeContent | null =>
  noticeFromTable(promoteHeadings(ITEM_WORDS[type]), error, {
    label: "Change not proposed",
    message: `The Maestro server did not answer, and nothing was pushed. Select ${PROPOSE_CHANGE} again.`,
  });

export const deletionNotice = (
  error: unknown,
  type: HarnessPrimitiveType,
): NoticeContent | null =>
  noticeFromTable(deletionHeadings(ITEM_WORDS[type]), error, {
    label: "Deletion not proposed",
    message: `The Maestro server did not answer, and nothing was pushed. Select ${ITEM_WORDS[type].deleteLabel} again.`,
  });

export const restoreNotice = (
  error: unknown,
  type: HarnessPrimitiveType,
): NoticeContent | null =>
  noticeFromTable(restorationHeadings(ITEM_WORDS[type]), error, {
    label: `${ITEM_WORDS[type].Noun} not restored`,
    message: `Nothing was restored. The Maestro server did not answer. Select ${ITEM_WORDS[type].restoreLabel} again.`,
  });

export const discardNotice = (
  error: unknown,
  item: PrimitiveRef,
): NoticeContent | null =>
  noticeFromTable(discardHeadings(item), error, {
    label: "Change not discarded",
    message: `Nothing was discarded. The Maestro server did not answer. Select ${DISCARD_CHANGE} again.`,
  });

// A full restore is a toast. The local half is final either way, so only a
// status the cockpit could not read again needs a notice (#915).
export const restoredNotice = (
  type: HarnessPrimitiveType,
  hasRequest: boolean,
  onRetry: () => void,
): NoticeContent => ({
  level: "warning",
  label: `${ITEM_WORDS[type].Noun} restored`,
  message: `The ${ITEM_WORDS[type].noun} ${ITEM_WORDS[type].holder} is back, but the status is out of date. Select ${rereadLabel("Harness")} to read GitHub again.`,
  detail: hasRequest
    ? "Your proposal remains unchanged."
    : "Maestro could not read GitHub after the restore.",
  action: { label: rereadLabel("Harness"), onClick: onRetry },
});

export const proposalNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(proposalHeadings, error, {
    label: "Pull request unchanged",
    message:
      "The Maestro server did not answer, and GitHub is as it was. Start the change again.",
  });
