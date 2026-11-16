// The row Pull request to the Harness on Categories in Settings, and the
// Create pull request dialog it opens.
import type {
  CategoriesProposalError,
  CategoriesProposalRow,
  CategoryCount,
} from "@maestro/core";
import { harnessHeadings } from "../harness/notice-copy";
import { stageStatusReading } from "../harness/stage-copy";
import { HARNESS_BUSY } from "../ui/busy-copy";
import {
  CREATE_PULL_REQUEST,
  rereadLabel,
  UPDATE_PULL_REQUEST,
} from "../ui/control-labels";
import { CLOSE } from "../ui/dialog-copy";
import type { NoticeContent, NoticeCopy } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";
import { type Copy, machine, named, namedList, phrase } from "../ui/phrase";
import type { StatusReading } from "../ui/status-reading";
import { countWords } from "./categories-copy";

export { CREATE_PULL_REQUEST, UPDATE_PULL_REQUEST };

/** The control while the operator's own pull request is open, or not. */
export type PullRequestAction =
  | typeof CREATE_PULL_REQUEST
  | typeof UPDATE_PULL_REQUEST;

const REREAD_CATEGORIES = rereadLabel("Categories");

export const PULL_REQUEST_ROW = "Pull request to the Harness";

/** The link to the Harness screen, where the pull request shows. */
export const VIEW_ON_HARNESS = "View on Harness";

const EMPTY_SENTENCE =
  "Add or copy at least one category before creating a pull request.";
const OVER_LIMITS_SENTENCE =
  "The Harness takes at most 200 categories in a file of at most 256 KB. Delete categories before creating a pull request.";

/** What the row shows in one state: its sentence, and why the button waits. */
export type PullRequestRowView = {
  sentence: Copy;
  /** The blocked button's tooltip; null where it can run. */
  blocked: string | null;
  /** The chip of the state the Harness row shows, beside the link; null for none. */
  open: StatusReading | null;
  action: PullRequestAction;
};

const EMPTY_CAUSE = "Add a category.";
const OVER_LIMITS_CAUSE = "Delete categories.";

// A list the write refuses blocks the button in any state that keeps its own sentence.
const listCause = (list: string): string | null =>
  list === "empty"
    ? EMPTY_CAUSE
    : list === "over-limits"
      ? OVER_LIMITS_CAUSE
      : null;

const blockedRow = (sentence: Copy, blocked: string): PullRequestRowView => ({
  sentence,
  blocked,
  open: null,
  action: CREATE_PULL_REQUEST,
});

/** Beside the pull request's own sentence when the operator's list differs from it. */
const DIFFERS_FROM_PULL_REQUEST =
  "Your categories differ from the pull request.";

export function pullRequestRow(row: CategoriesProposalRow): PullRequestRowView {
  switch (row.state) {
    case "start":
      return {
        sentence:
          "Propose your categories for the connected Harness. This creates a pull request for review.",
        blocked: null,
        open: null,
        action: CREATE_PULL_REQUEST,
      };
    case "empty":
      return blockedRow(EMPTY_SENTENCE, EMPTY_CAUSE);
    case "over-limits":
      return blockedRow(OVER_LIMITS_SENTENCE, OVER_LIMITS_CAUSE);
    case "unread":
      return blockedRow(
        `Maestro couldn't read the Harness or GitHub. Select ${REREAD_CATEGORIES} to try again.`,
        `${REREAD_CATEGORIES} first.`,
      );
    case "waiting-on-other":
      return blockedRow(
        phrase`${named(row.author)} has pull request #${row.number} open for the Harness categories. Wait until it is merged or closed.`,
        `Wait for pull request #${row.number}.`,
      );
    // The Harness row's own sentence, with the control this row carries.
    case "pull-request-missing":
      return {
        sentence: `The proposal branch is on GitHub without a pull request. Select ${CREATE_PULL_REQUEST} to open one.`,
        blocked: null,
        open: stageStatusReading("pull-request-missing"),
        action: CREATE_PULL_REQUEST,
      };
    // The Harness row's chip under Pending release; a new pull request
    // compares with the next release, which now holds the merged list.
    case "merged-not-released":
      return {
        sentence: `Pull request #${row.number} was merged. Teammates get these categories with the next Harness release.`,
        blocked: listCause(row.list),
        open: stageStatusReading("not-yet-released"),
        action: CREATE_PULL_REQUEST,
      };
    case "own-open": {
      const state =
        row.status === "changes-requested"
          ? `A reviewer asked for changes on pull request #${row.number}. Change your categories, then select ${UPDATE_PULL_REQUEST} to send them.`
          : `Pull request #${row.number} is open and waiting for a reviewer. Select ${UPDATE_PULL_REQUEST} to send your current categories.`;
      return {
        sentence:
          row.list === "differs"
            ? `${state} ${DIFFERS_FROM_PULL_REQUEST}`
            : state,
        blocked: listCause(row.list),
        open: stageStatusReading(row.status),
        action: UPDATE_PULL_REQUEST,
      };
    }
  }
}

export const CREATE_PULL_REQUEST_BODY =
  "This creates a pull request on GitHub that replaces the Harness categories with your list. A curator reviews it and decides whether to merge it. Your categories stay as they are.";

/** Heard while the difference is read; shown inside the dialog. */
export const COMPARING = "Comparing with the next release…";

export const COMPARED_WITH_NEXT_RELEASE = "Compared with the next release";
export const ADDED_TO_HARNESS = "Added to the Harness";
export const DELETED_FROM_HARNESS = "Deleted from the Harness";
export const MOVED_TO_ANOTHER_CATEGORY = "Moved to another category";

/** The Update pull request dialog's title. */
export const updatePullRequestTitle = (number: number) =>
  `${UPDATE_PULL_REQUEST} #${number}`;

export const updatePullRequestBody = (number: number) =>
  `This updates your open pull request #${number} with your current categories. A curator reviews it and decides whether to merge it. Your categories stay as they are.`;

/** Heard while the difference against the pull request is read. */
export const comparingWithPullRequest = (number: number) =>
  `Comparing with pull request #${number}…`;

export const comparedWithPullRequest = (number: number) =>
  `Compared with pull request #${number}`;
export const ADDED_TO_PULL_REQUEST = "Added to the pull request";
export const DELETED_FROM_PULL_REQUEST = "Deleted from the pull request";

export const SAME_AS_PULL_REQUEST = {
  level: "info",
  label: "Your categories match the pull request",
  message: "An update would change nothing in the pull request.",
} as const satisfies NoticeContent;

export const PULL_REQUEST_UNREADABLE = {
  level: "warning",
  label: "Couldn't compare with the pull request",
  message:
    "The categories file in the pull request contains an error. Your update replaces the whole file, so you can still send it.",
} as const satisfies NoticeContent;

/** A group's legend with its count. */
export const groupLegend = (group: string, count: number) =>
  `${group} · ${count}`;

/** `3 skills and 2 prompts`, `1 skill`; null for none. */
export const itemsCounted = (
  skills: number,
  prompts: number,
): string | null => {
  const parts = [
    skills > 0 ? countWords(skills, "skill") : null,
    prompts > 0 ? countWords(prompts, "prompt") : null,
  ].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(" and ");
};

/** The warning above a danger confirm: what merging takes from the Harness. */
export const pullRequestDeletes = (
  deleted: readonly CategoryCount[],
): NoticeContent => {
  const names = deleted.map((each) => each.name);
  const items = itemsCounted(
    deleted.reduce((sum, each) => sum + each.skills, 0),
    deleted.reduce((sum, each) => sum + each.prompts, 0),
  );
  return {
    level: "warning",
    label: `This pull request deletes ${deleted.length} Harness ${deleted.length === 1 ? "category" : "categories"}`,
    message:
      items === null
        ? phrase`Once it is merged, the Harness categories no longer include ${namedList(names)}.`
        : phrase`Once it is merged, ${items} in ${namedList(names)} have no category in the Harness.`,
  };
};

export const SAME_AS_NEXT_RELEASE = {
  level: "info",
  label: "Your categories match the next release",
  message: "A pull request would change nothing in the Harness.",
} as const satisfies NoticeContent;

export const NEXT_RELEASE_UNREADABLE = {
  level: "warning",
  label: "Couldn't compare with the next release",
  message:
    "The categories file in the next release contains an error. Your pull request replaces the whole file, so you can still create it.",
} as const satisfies NoticeContent;

/** A request the server never answered: GitHub may hold the pull request. */
const notConfirmed = (action: PullRequestAction): NoticeCopy => ({
  label: "Pull request not confirmed",
  message: `The Maestro server did not respond, so the pull request may already be ${action === UPDATE_PULL_REQUEST ? "updated" : "open"}. Select ${CLOSE}, then check the Harness screen.`,
});

/** The branch is pushed and GitHub opened no pull request for it. */
export const PULL_REQUEST_NOT_OPENED = {
  level: "error",
  label: "Pull request not opened",
  message: phrase`Maestro pushed your categories to the branch ${machine("maestro/list.categories")}, but GitHub opened no pull request. Select ${CLOSE}, then check the Harness screen.`,
} as const satisfies NoticeContent;

const headings = (
  action: PullRequestAction,
): NoticeTable<CategoriesProposalError> => {
  const AGAIN = `select ${action} again.`;
  return {
    "not-configured": harnessHeadings["not-configured"],
    "no-usable-origin": harnessHeadings["no-usable-origin"],
    "categories-unreadable": {
      level: "error",
      label: "Categories not read",
      message: `Select ${CLOSE}, then select ${REREAD_CATEGORIES}.`,
    },
    "no-answer": {
      level: "error",
      label: "GitHub did not respond",
      message: `Select ${CLOSE}, then select ${REREAD_CATEGORIES} to see where the pull request stands.`,
    },
    "list-empty": {
      level: "error",
      label: "No categories to propose",
      message: EMPTY_SENTENCE,
    },
    "list-too-large": {
      level: "error",
      label: "Too many categories",
      message: OVER_LIMITS_SENTENCE,
    },
    "list-unchanged": {
      level: "error",
      label: SAME_AS_NEXT_RELEASE.label,
      message: SAME_AS_NEXT_RELEASE.message,
    },
    "proposed-by-other": {
      level: "error",
      label: "Another contributor's pull request is open",
      message: `Nothing was pushed. Wait until it is merged or closed, then ${AGAIN}`,
    },
    "request-unchanged": {
      level: "error",
      label: SAME_AS_PULL_REQUEST.label,
      message: `Nothing was pushed. ${SAME_AS_PULL_REQUEST.message}`,
    },
    "push-elsewhere": {
      level: "error",
      label: "Different push remote",
      message:
        "Nothing was pushed. Point the clone's push remote at its origin.",
      detail: "Maestro publishes only to the origin it reads from.",
    },
    "promote-failed": {
      level: "error",
      label:
        action === UPDATE_PULL_REQUEST
          ? "Pull request not updated"
          : "Pull request not created",
      message: `Your categories stay as they are. Select ${CLOSE}, then ${AGAIN}`,
    },
    "promote-in-progress": {
      level: "error",
      label: HARNESS_BUSY,
      message: `Wait for that change to finish, then ${AGAIN}`,
      detail: "Maestro proposes one change at a time.",
    },
  };
};

/** Why the dialog could not compare, create or update; never a claim about GitHub it cannot make. */
export const pullRequestNotice = (
  error: unknown,
  action: PullRequestAction,
): NoticeContent | null =>
  noticeFromTable(headings(action), error, notConfirmed(action));
