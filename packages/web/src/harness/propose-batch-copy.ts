import type { ProposeBatchError } from "@maestro/core";
import {
  CREATE_RELEASE,
  rereadLabel,
  UPDATE_TARGET,
} from "../ui/control-labels";
import { CLOSE } from "../ui/dialog-copy";
import type { NoticeContent } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";
import { named, type Phrase, phrase } from "../ui/phrase";
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

export const proposeBatchHeading = (proposed: number, total: number) =>
  `Proposed ${proposed} of ${total} ${changes(total)}`;

export const NOT_PROPOSED = "Not proposed";
export const PROPOSED = "Proposed";
export const PROPOSED_NOTE = `Review and merge each pull request on GitHub. Then select ${CREATE_RELEASE}.`;

// The confirmation a batch with a deletion opens on (#1828). Its wording is
// the Confirm canvas's, except where a prompt or a single change differs.
export const PER_CHANGE_PULL_REQUEST = "Each change gets its own pull request.";

const plural = (count: number, one: string, many: string) =>
  count === 1 ? one : many;

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
          "The Prompts screen keeps the prompt until the next release.",
          "The Prompts screen keeps the prompts until the next release.",
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
