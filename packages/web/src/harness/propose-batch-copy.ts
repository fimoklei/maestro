import type { ProposeBatchError } from "@maestro/core";
import {
  CREATE_RELEASE,
  rereadLabel,
  UPDATE_TARGET,
} from "../ui/control-labels";
import { CLOSE } from "../ui/dialog-copy";
import type { NoticeContent, NoticeCopy } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";
import { named, namedList, type Phrase, phrase } from "../ui/phrase";
import { ITEM_WORDS } from "./item-words";
import {
  harnessHeadings,
  promoteHeadings,
  STALE_NEXT_RELEASE,
} from "./notice-copy";
import { BatchReportMissing } from "./use-harness";

// Propose changes, the selection bar's action on rows under Pending proposal.
export const PROPOSE_CHANGES = "Propose changes";

const changes = (count: number) => (count === 1 ? "change" : "changes");

export const proposeBatchTitle = (count: number) =>
  `Propose ${count} ${changes(count)}`;

// With no pull request opened at all, the batch only pushed its branches.
export const proposeBatchHeading = (
  opened: number,
  pushed: number,
  total: number,
) =>
  opened === 0 && pushed > 0
    ? `Pushed ${pushed} of ${total} ${changes(total)}`
    : `Proposed ${opened} of ${total} ${changes(total)}`;

export const NOT_PROPOSED = "Not proposed";
export const PROPOSED = "Proposed";
export const PROPOSED_NOTE = `Review and merge each pull request on GitHub. Then select ${CREATE_RELEASE}.`;
// A pushed branch whose pull request did not open: its next step, per row.
export const PULL_REQUEST_MISSING = "Pull request missing";
export const PULL_REQUEST_MISSING_DETAIL =
  "The proposal branch is on GitHub without a pull request. Select Close, then select Create pull request.";
export const CREATE_PULL_REQUEST_ON_GITHUB = "Create pull request on GitHub";

const NO_GH_CAUSE =
  "Maestro opens pull requests through gh, and gh is not available.";

/** The Report's one lead without gh: every pushed row's next step at once. */
export const noGhNotice = (missing: number): NoticeCopy =>
  missing === 1
    ? {
        label: "Pull request not opened",
        message: `Select ${CREATE_PULL_REQUEST_ON_GITHUB}.`,
        detail: NO_GH_CAUSE,
      }
    : {
        label: "Pull requests not opened",
        message: `Select ${CREATE_PULL_REQUEST_ON_GITHUB} on each row.`,
        detail: NO_GH_CAUSE,
      };

// The confirmation a batch with a deletion opens on (#1828). Its wording is
// the Confirm canvas's, except where a prompt or a single change differs.
export const PER_CHANGE_PULL_REQUEST = "Each change gets its own pull request.";

const plural = (count: number, one: string, many: string) =>
  count === 1 ? one : many;

// A deletion with no default-branch copy: its confirmation cannot run.
export const NOT_IN_NEXT_RELEASE = "Not in the next release";

/** Why the confirmation is blocked, naming each deletion it cannot confirm. */
export const notInNextReleaseNotice = (
  names: readonly string[],
): NoticeContent => ({
  level: "error",
  label: NOT_IN_NEXT_RELEASE,
  message:
    names.length === 1
      ? phrase`${namedList(names)} is not in the next release, so there is nothing to delete. Select ${CLOSE}, then deselect it.`
      : phrase`${namedList(names)} are not in the next release, so there is nothing to delete. Select ${CLOSE}, then deselect them.`,
});

/** The first sentence: what the batch deletes, from which origin. */
export const deletionsSentence = (
  deletions: { type: "skill" | "prompt" }[],
  origin: string,
): Phrase => {
  const total = deletions.length;
  const skills = deletions.filter((each) => each.type === "skill").length;
  const prompts = total - skills;
  const nouns =
    skills > 0 && prompts > 0
      ? "skills and prompts"
      : skills > 0
        ? plural(skills, "a skill", "skills")
        : plural(prompts, "a prompt", "prompts");
  return phrase`${total} ${plural(total, "change", "changes")} ${plural(total, "deletes", "delete")} ${nouns} from ${named(origin)} when merged.`;
};

/** What still holds each deleted type until the next release, one line per type. */
export const deletionsKept = (skills: number, prompts: number): string[] => [
  ...(skills === 0
    ? []
    : [
        skills === 1
          ? `Your targets keep the skill. After the next release, select ${UPDATE_TARGET} on each target to remove it.`
          : `Your targets keep the skills. After the next release, select ${UPDATE_TARGET} on each target to remove them.`,
      ]),
  ...(prompts === 0
    ? []
    : [
        plural(
          prompts,
          "The prompt is kept until the next release.",
          "The prompts are kept until the next release.",
        ),
      ]),
];

const batchHeadings: NoticeTable<ProposeBatchError> = {
  ...harnessHeadings,
  "no-answer": {
    ...promoteHeadings(ITEM_WORDS.skill)["no-answer"],
    message: `Nothing was pushed. Select ${rereadLabel("Harness")}, then select ${PROPOSE_CHANGES} again.`,
  },
  "confirmation-stale": {
    level: "error",
    label: "Confirmation out of date",
    message: `Nothing was pushed. Select ${rereadLabel("Harness")}, then select ${PROPOSE_CHANGES} again.`,
    detail: STALE_NEXT_RELEASE,
  },
  "promote-in-progress": {
    ...promoteHeadings(ITEM_WORDS.skill)["promote-in-progress"],
    message: `Wait for that change to finish, then select ${PROPOSE_CHANGES} again.`,
  },
};

const NO_REPORT = {
  level: "error",
  label: "No report from Maestro",
  message: `Some changes may already be proposed. Select ${CLOSE}, then select ${rereadLabel("Harness")} to see each one.`,
} as const;

/** Why the batch ran no item, or why its report never came. */
export const proposeBatchNotice = (error: unknown): NoticeContent | null =>
  error instanceof BatchReportMissing
    ? NO_REPORT
    : noticeFromTable(batchHeadings, error, NO_REPORT);
