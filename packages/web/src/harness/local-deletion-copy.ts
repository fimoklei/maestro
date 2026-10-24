import type { DeleteLocalError, HarnessPrimitiveType } from "@maestro/core";
import { HARNESS_BUSY } from "../ui/busy-copy";
import { rereadLabel } from "../ui/control-labels";
import { CLOSE } from "../ui/dialog-copy";
import type { NoticeContent } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";
import { named, phrase } from "../ui/phrase";
import { ITEM_WORDS } from "./item-words";
import {
  harnessHeadings,
  invalidNameHeading,
  linkInHarness,
  typeFolderNotRead,
} from "./notice-copy";

/** Delete skill and Delete prompt open from the Harness view and from their Inventory views. */
export type LocalDeletionContext = {
  type: HarnessPrimitiveType;
  name: string;
  screen: "harness" | "skills" | "prompts";
};

// Each screen's own control that shows the item as it is now.
const SEE_IT_NOW: Record<LocalDeletionContext["screen"], string> = {
  harness: `Select ${rereadLabel("Harness")} to see the`,
  skills: "Select Harness to see the",
  prompts: "Select Harness to see the",
};

// Nothing here reaches GitHub, so no sentence names a push or a pull request
// (#798).
const localDeletionHeadings = ({
  type,
  name,
  screen,
}: LocalDeletionContext): NoticeTable<DeleteLocalError> => {
  const w = ITEM_WORDS[type];
  return {
    "not-configured": harnessHeadings["not-configured"],
    "invalid-skill": invalidNameHeading(w),
    "already-gone": {
      level: "error",
      label: `${w.Holder} already deleted`,
      message: `${SEE_IT_NOW[screen]} ${w.noun} as it is now.`,
      detail: phrase`Something removed the ${named(name)} ${w.holder} from your clone after this dialog opened.`,
    },
    "confirmation-stale": {
      level: "error",
      label: "Confirmation out of date",
      message: `Nothing was deleted. The dialog now shows the ${w.holder} as it is. Select ${w.deleteLabel} to delete it.`,
      detail: phrase`The ${named(name)} ${w.holder} changed after this dialog opened.`,
    },
    "no-answer": {
      level: "error",
      label: "Clone not read",
      message: `Nothing was deleted. Select ${CLOSE}, then select ${w.deleteLabel} again.`,
      detail: "Git could not read your clone.",
    },
    "destination-unsafe": linkInHarness(
      w,
      `Nothing was deleted. Replace the link with a real ${w.holder}, then select ${w.deleteLabel} again.`,
    ),
    "destination-unreadable": typeFolderNotRead(
      w,
      `Nothing was deleted. Make the Harness ${w.home} readable, then select ${w.deleteLabel} again.`,
    ),
    "delete-failed": {
      level: "error",
      label: `${w.Noun} not deleted`,
      message: `The Harness is as it was. Make the ${w.holder} writable, then select ${w.deleteLabel} again.`,
    },
    "delete-in-progress": {
      level: "error",
      label: HARNESS_BUSY,
      message: `Wait for that change to finish, then select ${w.deleteLabel} again.`,
      detail: "Maestro changes one Harness at a time.",
    },
  };
};

export const localDeletionNotice = (
  error: unknown,
  context: LocalDeletionContext,
): NoticeContent | null =>
  noticeFromTable(localDeletionHeadings(context), error, {
    label: `${ITEM_WORDS[context.type].Noun} not deleted`,
    message: `The Maestro server did not answer, and the Harness is as it was. Select ${ITEM_WORDS[context.type].deleteLabel} again.`,
  });

// A check that failed, or found no file or folder, before anything was pressed.
export const deletionCheckNotice = (
  outcome: "no-answer" | "already-gone",
  context: LocalDeletionContext,
): NoticeContent => localDeletionHeadings(context)[outcome];
