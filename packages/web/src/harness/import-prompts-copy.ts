// Every word the Import prompts dialog and its Report show.

import type { ImportPromptsError, PromptImportRefusal } from "@maestro/core";
import { ALREADY_IN_HARNESS } from "../deploy-state/import-local-edits-copy";
import { CHANGE_LOCATION_STEP } from "../settings/settings-copy";
import { HARNESS_BUSY } from "../ui/busy-copy";
import { IMPORT_PROMPTS, PROPOSE_CHANGE } from "../ui/control-labels";
import { CLOSE } from "../ui/dialog-copy";
import type { NoticeContent } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";
import { harnessHeadings } from "./notice-copy";

export const PROMPT_FILES_LABEL = "Prompt files";
export const PROMPT_FILES_HINT = "Use .md or .txt files of 100 KB or less.";
export const CHOOSE_FILES = "Choose files";

/** The confirm: the checked count, live. */
export const importPromptsConfirm = (count: number): string =>
  count === 0
    ? IMPORT_PROMPTS
    : `Import ${count} ${count === 1 ? "prompt" : "prompts"}`;

export const CHOOSE_FILES_FIRST = "Choose files.";
export const NO_PROMPT_QUALIFIES = "You cannot import any of these prompts.";
export const NOTHING_CHECKED = "Check at least one prompt.";

/** Why a chosen file is not offered, or why the import refused it. */
export type PromptFileRefusal =
  | PromptImportRefusal
  // Read in the browser, before anything is sent.
  | "not-text"
  | "same-name";

const RENAME = "Rename the file, then choose it again.";
const LONG_DESCRIPTION =
  "Keep the description to one line of 1,024 characters or less. Then choose the file again.";
const NOT_WRITTEN = `Make the prompts folder writable, then select ${IMPORT_PROMPTS} again.`;

export const PROMPT_FILE_REFUSALS: Record<PromptFileRefusal, string> = {
  "not-text":
    "Maestro reads only UTF-8 text. Save the file as UTF-8, then choose it again.",
  "empty-name": `The file name has no letters or digits. ${RENAME}`,
  "invalid-name": `The file name does not make a usable prompt name. ${RENAME}`,
  "same-name": `Another chosen file has the same name. ${RENAME}`,
  "empty-description":
    "The file has no description in its front matter. Add one, then choose the file again.",
  "multiline-description": LONG_DESCRIPTION,
  "long-description": LONG_DESCRIPTION,
  "empty-text":
    "The file has no prompt text below its front matter. Add the text, then choose the file again.",
  "long-text": "The file is over 100 KB. Shorten it, then choose it again.",
  // A held prompt is listed apart, so this reaches only the Report: the name
  // was taken after the check.
  "prompt-taken": `The Harness now has a prompt with this name. To replace it, select ${IMPORT_PROMPTS} again. Choose the file, then check it under ${ALREADY_IN_HARNESS}.`,
  "destination-unsafe":
    "The prompt file in the Harness is a link. Replace the link with a real file, then import the prompt again.",
  "destination-unreadable": NOT_WRITTEN,
  "write-failed": NOT_WRITTEN,
};

export const importPromptsReportHeading = (
  landed: number,
  asked: number,
): string =>
  `Imported ${landed} of ${asked} ${asked === 1 ? "prompt" : "prompts"}`;

export const IMPORTED_PROMPTS_NEXT_STEP = `Each is now a Pending proposal. Open the row's menu, then select ${PROPOSE_CHANGE}.`;

const NOTHING = "Nothing was imported.";

const IMPORT_PROMPTS_ERRORS: NoticeTable<ImportPromptsError> = {
  "not-configured": {
    ...harnessHeadings["not-configured"],
    message: `${CHANGE_LOCATION_STEP}, then select ${IMPORT_PROMPTS} again.`,
  },
  "destination-unsafe": {
    level: "error",
    label: "Link in the Harness",
    message: `${NOTHING} Replace the link with a real folder, then select ${IMPORT_PROMPTS} again.`,
    detail: "The .maestro/prompts folder is a link.",
  },
  "destination-unreadable": {
    level: "error",
    label: "Prompts folder not read",
    message: `${NOTHING} Make the prompts folder readable, then select ${IMPORT_PROMPTS} again.`,
  },
  "import-in-progress": {
    level: "error",
    label: HARNESS_BUSY,
    message: `${NOTHING} Wait for that change to finish, then select ${IMPORT_PROMPTS} again.`,
    detail: "Maestro changes one Harness at a time.",
  },
};

/** The whole batch refused, or no answer; the chosen files stay listed. */
export const importPromptsNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(IMPORT_PROMPTS_ERRORS, error, {
    label: "Prompts not imported",
    message: `The Maestro server did not answer, so some prompts may have landed. Select ${CLOSE}, then check the Harness screen.`,
  });
