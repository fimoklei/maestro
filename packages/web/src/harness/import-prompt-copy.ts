import type { ImportPromptError } from "@maestro/core";
import type { PromptFieldProblem } from "@maestro/core/prompt-file";
import { CHANGE_LOCATION_STEP } from "../settings/settings-copy";
import { HARNESS_BUSY } from "../ui/busy-copy";
import { IMPORT_PROMPT } from "../ui/control-labels";
import type { NoticeContent } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";
import { machine, phrase, plainText } from "../ui/phrase";
import { ITEM_WORDS } from "./item-words";
import { harnessHeadings, invalidNameHeading } from "./notice-copy";

export const PROMPT_FIELD_HINTS = {
  name: phrase`Maestro uses this as the file name in ${machine(".maestro/prompts")}.`,
  description: "One line, shown in the Prompts table.",
  text: "Saved exactly as you enter it.",
} as const;

// Over 100 KB is a notice, not a field error: its way through is longer.
type FieldError = Exclude<PromptFieldProblem, "long-text">;

const LONG_DESCRIPTION =
  "Keep the description to one line of 1,024 characters or less.";

export const PROMPT_FIELD_ERRORS: Record<FieldError, string> = {
  "empty-name": "Enter a name.",
  "invalid-name": plainText(invalidNameHeading(ITEM_WORDS.prompt).message),
  "empty-description": "Enter a description.",
  "multiline-description": LONG_DESCRIPTION,
  "long-description": LONG_DESCRIPTION,
  "empty-text": "Enter the prompt text.",
};

export const isFieldError = (code: unknown): code is FieldError =>
  typeof code === "string" && Object.hasOwn(PROMPT_FIELD_ERRORS, code);

type NoticeCode = Exclude<ImportPromptError, FieldError>;

const IMPORTED_NOTHING = "Nothing was imported.";

const importPromptHeadings: NoticeTable<NoticeCode> = {
  "not-configured": {
    ...harnessHeadings["not-configured"],
    message: `${CHANGE_LOCATION_STEP}, then select ${IMPORT_PROMPT} again.`,
  },
  "long-text": {
    level: "error",
    label: "Prompt over 100 KB",
    message: `Shorten the text to 100 KB or less. Then select ${IMPORT_PROMPT}.`,
  },
  "destination-unsafe": {
    level: "error",
    label: "Prompts folder outside the Harness",
    message: `${IMPORTED_NOTHING} Replace the link with a real folder, then select ${IMPORT_PROMPT} again.`,
    detail: "The .maestro/prompts folder resolves outside the Harness clone.",
  },
  "destination-unreadable": {
    level: "error",
    label: "Prompts folder not read",
    message: `${IMPORTED_NOTHING} Make the Harness clone readable, then select ${IMPORT_PROMPT} again.`,
  },
  "import-in-progress": {
    level: "error",
    label: HARNESS_BUSY,
    message: `Wait for that change to finish, then select ${IMPORT_PROMPT} again.`,
    detail: "Maestro changes one Harness at a time.",
  },
  "write-failed": {
    level: "error",
    label: "Prompt not imported",
    message: `The Harness is as it was. Make the prompts folder writable, then select ${IMPORT_PROMPT} again.`,
  },
};

/** The text over 100 KB, refused before any request. */
export const LONG_TEXT_NOTICE: NoticeContent =
  importPromptHeadings["long-text"];

// The edge refuses a broken field as a request-shape notice; the dialog
// checks the same rules first, so only the codes below reach this table.
export const importPromptNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(importPromptHeadings, error, {
    label: "Prompt not imported",
    message: `The Maestro server did not answer, and nothing reached the Harness. Select ${IMPORT_PROMPT} again.`,
  });
