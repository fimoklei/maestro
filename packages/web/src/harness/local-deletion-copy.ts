import type { DeleteLocalSkillError } from "@maestro/core";
import { DELETE_SKILL, rereadLabel } from "../ui/control-labels";
import { CLOSE } from "../ui/dialog-copy";
import type { NoticeContent } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";
import { named, phrase } from "../ui/phrase";
import { HARNESS_BUSY, harnessHeadings, promoteHeadings } from "./notice-copy";

/** Delete skill opens from the Harness view and from Inventory. */
export type LocalDeletionContext = {
  skill: string;
  screen: "harness" | "inventory";
};

// Each screen's own control that shows the skill as it is now.
const SEE_IT_NOW: Record<LocalDeletionContext["screen"], string> = {
  harness: `Select ${rereadLabel("Harness")} to see the skill as it is now.`,
  inventory: "Select Harness to see the skill as it is now.",
};

// Nothing here reaches GitHub, so no sentence names a push or a pull request
// (#798).
const localDeletionHeadings = ({
  skill,
  screen,
}: LocalDeletionContext): NoticeTable<DeleteLocalSkillError> => ({
  "not-configured": harnessHeadings["not-configured"],
  "invalid-skill": promoteHeadings["invalid-skill"],
  "already-gone": {
    level: "error",
    label: "Folder already deleted",
    message: SEE_IT_NOW[screen],
    detail: phrase`Something removed the ${named(skill)} folder from your clone after this dialog opened.`,
  },
  "confirmation-stale": {
    level: "error",
    label: "Confirmation out of date",
    message: `Nothing was deleted. The dialog now shows the folder as it is. Select ${DELETE_SKILL} to delete it.`,
    detail: phrase`The ${named(skill)} folder changed after this dialog opened.`,
  },
  "no-answer": {
    level: "error",
    label: "Clone not read",
    message: `Nothing was deleted. Select ${CLOSE}, then select ${DELETE_SKILL} again.`,
    detail: "Git could not read your clone.",
  },
  "destination-unsafe": {
    level: "error",
    label: "Folder outside the Harness",
    message: `Nothing was deleted. Replace the link with a real folder, then select ${DELETE_SKILL} again.`,
    detail: "The skill folder resolves outside the Harness skills folder.",
  },
  "delete-failed": {
    level: "error",
    label: "Skill not deleted",
    message: `The Harness is as it was. Make the folder writable, then select ${DELETE_SKILL} again.`,
  },
  "delete-in-progress": {
    level: "error",
    label: HARNESS_BUSY,
    message: `Wait for that change to finish, then select ${DELETE_SKILL} again.`,
    detail: "Maestro changes one Harness at a time.",
  },
});

export const localDeletionNotice = (
  error: unknown,
  context: LocalDeletionContext,
): NoticeContent | null =>
  noticeFromTable(localDeletionHeadings(context), error, {
    label: "Skill not deleted",
    message: `The Maestro server did not answer, and the Harness is as it was. Select ${DELETE_SKILL} again.`,
  });

// A check that failed, or found no folder, before anything was pressed.
export const deletionCheckNotice = (
  outcome: "no-answer" | "already-gone",
  context: LocalDeletionContext,
): NoticeContent => localDeletionHeadings(context)[outcome];
