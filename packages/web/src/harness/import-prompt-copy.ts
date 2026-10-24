import type { ImportMode, ImportPromptError } from "@maestro/core";
import type { PromptFieldProblem } from "@maestro/core/prompt-file";
import { CHANGE_LOCATION_STEP } from "../settings/settings-copy";
import type { ActionKey } from "../ui/busy-copy";
import { HARNESS_BUSY } from "../ui/busy-copy";
import {
  CHOOSE_ANOTHER_FILE,
  IMPORT_PROMPT,
  UPDATE_PROMPT,
} from "../ui/control-labels";
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

/** Where the prompt text comes from: the dialog's two tabs. */
export type PromptSource = "paste" | "file";

/** The accessible name of the Paste text / Choose file switch. */
export const PROMPT_SOURCE_LABEL = "Prompt source";

export const PROMPT_SOURCES: readonly { value: PromptSource; label: string }[] =
  [
    { value: "paste", label: "Paste text" },
    { value: "file", label: "Choose file" },
  ];

export const CHOOSE_FILE_HINT = "Use a .md or .txt file of 100 KB or less.";

/** The chosen file's size beside its name, in the KB of the 100 KB limit. */
// Rounded up, so a file just over the limit never reads as 100.0 KB.
export const fileSize = (bytes: number): string =>
  `${(Math.ceil(bytes / 102.4) / 10).toFixed(1)} KB`;

/** The chosen file is not UTF-8; nothing reached the fields. */
export const NOT_TEXT_FILE_NOTICE: NoticeContent = {
  level: "error",
  label: "Not a text file",
  message: `Maestro reads only UTF-8 text. ${CHOOSE_ANOTHER_FILE}.`,
};

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

/** The dialog's submit control: Update prompt once the name is taken. */
export type PromptConfirm = typeof IMPORT_PROMPT | typeof UPDATE_PROMPT;

/** The dialog's title, submit label and busy verb, by whether the name is taken. */
export const PROMPT_IMPORT_MODES = {
  add: { title: "Import a prompt", confirm: IMPORT_PROMPT, verb: "import" },
  update: { title: "Update a prompt", confirm: UPDATE_PROMPT, verb: "update" },
} as const satisfies Record<
  ImportMode,
  { title: string; confirm: PromptConfirm; verb: ActionKey }
>;

const importPromptHeadings = (
  confirm: PromptConfirm,
): NoticeTable<NoticeCode> => ({
  "not-configured": {
    ...harnessHeadings["not-configured"],
    message: `${CHANGE_LOCATION_STEP}, then select ${confirm} again.`,
  },
  "long-text": {
    level: "error",
    label: "Prompt over 100 KB",
    message: `Shorten the text to 100 KB or less. Then select ${confirm}.`,
  },
  "destination-unsafe": {
    level: "error",
    label: "Link in the Harness",
    message: `${IMPORTED_NOTHING} Replace the link with a real file or folder, then select ${confirm} again.`,
    detail: "The .maestro/prompts folder or the prompt file is a link.",
  },
  "destination-unreadable": {
    level: "error",
    label: "Prompts folder not read",
    message: `${IMPORTED_NOTHING} Make the Harness clone readable, then select ${confirm} again.`,
  },
  "import-in-progress": {
    level: "error",
    label: HARNESS_BUSY,
    message: `Wait for that change to finish, then select ${confirm} again.`,
    detail: "Maestro changes one Harness at a time.",
  },
  "write-failed": {
    level: "error",
    label: "Prompt not imported",
    message: `The Harness is as it was. Make the prompts folder writable, then select ${confirm} again.`,
  },
});

/** The text over 100 KB, refused before any request. */
export const longTextNotice = (confirm: PromptConfirm): NoticeContent =>
  importPromptHeadings(confirm)["long-text"];

/** Under Name once the name check finds the prompt in the Harness. */
export const PROMPT_TAKEN_NOTICE: NoticeContent = {
  level: "info",
  label: "Prompt already in the Harness",
  message: `Select ${UPDATE_PROMPT} to replace its text and description.`,
  detail: "To keep it, pick another name.",
};

// The edge refuses a broken field as a request-shape notice; the dialog
// checks the same rules first, so only the codes below reach this table.
export const importPromptNotice = (
  error: unknown,
  confirm: PromptConfirm,
): NoticeContent | null =>
  noticeFromTable(importPromptHeadings(confirm), error, {
    label: "Prompt not imported",
    message: `The Maestro server did not answer, and nothing reached the Harness. Select ${confirm} again.`,
  });
