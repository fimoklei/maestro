import type { ImportMode, ImportPromptError } from "@maestro/core";
import type { PromptFieldProblem } from "@maestro/core/prompt-file";
import { HttpError } from "../api/http";
import { CHANGE_LOCATION_STEP } from "../settings/settings-copy";
import type { ActionKey } from "../ui/busy-copy";
import { HARNESS_BUSY } from "../ui/busy-copy";
import {
  CHOOSE_ANOTHER_FILE,
  EDIT_PROMPT,
  IMPORT_PROMPT,
  RESTORE_LABEL,
  rereadLabel,
  UPDATE_PROMPT,
} from "../ui/control-labels";
import { CLOSE } from "../ui/dialog-copy";
import type { NoticeContent } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";
import { machine, named, phrase, plainText } from "../ui/phrase";
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

/** The dialog's submit control: Update prompt once the name is taken, Edit prompt on a chosen prompt. */
export type PromptConfirm =
  | typeof IMPORT_PROMPT
  | typeof UPDATE_PROMPT
  | typeof EDIT_PROMPT;

// An edit states its refusals in the import's words, with its own verb.
const outcomeWords = (confirm: PromptConfirm) =>
  confirm === EDIT_PROMPT
    ? { nothing: "Nothing was edited.", heading: "Prompt not edited" }
    : { nothing: "Nothing was imported.", heading: "Prompt not imported" };

/** The edit dialog's title, on the prompt the reader chose. */
export const editPromptTitle = (prompt: string) => `Edit ${prompt}`;

/** Why Edit prompt is blocked while both fields hold what was read. */
export const NOTHING_CHANGED = "Change the description or text.";

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
): NoticeTable<NoticeCode> => {
  const { nothing, heading } = outcomeWords(confirm);
  return {
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
      message: `${nothing} Replace the link with a real file or folder, then select ${confirm} again.`,
      detail: "The .maestro/prompts folder or the prompt file is a link.",
    },
    "destination-unreadable": {
      level: "error",
      label: "Prompts folder not read",
      message: `${nothing} Make the Harness clone readable, then select ${confirm} again.`,
    },
    "import-in-progress": {
      level: "error",
      label: HARNESS_BUSY,
      message: `Wait for that change to finish, then select ${confirm} again.`,
      detail: "Maestro changes one Harness at a time.",
    },
    "write-failed": {
      level: "error",
      label: heading,
      message: `The Harness is as it was. Make the prompts folder writable, then select ${confirm} again.`,
    },
  };
};

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
    label: outcomeWords(confirm).heading,
    message: `The Maestro server did not answer, and nothing reached the Harness. Select ${confirm} again.`,
  });

/** The screen Edit prompt opened on, which names the way to Restore prompt. */
export type EditScreen = "harness" | "prompts";

const RESTORE_STEP: Record<EditScreen, string> = {
  harness: `Select ${rereadLabel("Harness")}, then select ${RESTORE_LABEL.prompt}.`,
  prompts: `Select Harness, then select ${RESTORE_LABEL.prompt}.`,
};

const NOT_IN_CLONE = "Prompt not in your clone";

const refusedWith = (error: unknown, code: string) =>
  error instanceof HttpError && error.code === code;

/** A refused edit, the dialog still open with the typed text. */
export const editPromptNotice = (
  error: unknown,
  { name, screen }: { name: string; screen: EditScreen },
): NoticeContent | null => {
  const { nothing } = outcomeWords(EDIT_PROMPT);
  if (refusedWith(error, "prompt-missing")) {
    return {
      level: "error",
      label: NOT_IN_CLONE,
      message: `${nothing} ${RESTORE_STEP[screen]}`,
      detail: phrase`Something removed the ${named(name)} file from your clone after this dialog opened.`,
    };
  }
  if (refusedWith(error, "prompt-changed")) {
    return {
      level: "error",
      label: "Prompt out of date",
      message: `${nothing} Copy your text, select ${CLOSE}, then select ${EDIT_PROMPT} again.`,
      detail: phrase`The ${named(name)} file changed after this dialog opened.`,
    };
  }
  return importPromptNotice(error, EDIT_PROMPT);
};

/** A read on the Prompts screen that opened no dialog. */
export const promptReadNotice = (
  error: unknown,
  {
    name,
    origin,
    localDeletion,
  }: {
    name: string;
    /** The Harness origin, or null where its read has not answered. */
    origin: string | null;
    /** The Harness holds a deletion of the prompt that Restore prompt undoes. */
    localDeletion: boolean;
  },
): NoticeContent | null =>
  refusedWith(error, "prompt-missing")
    ? {
        level: "error",
        label: NOT_IN_CLONE,
        message: localDeletion
          ? RESTORE_STEP.prompts
          : `Pull the latest changes in your Git tool, then select ${EDIT_PROMPT} again.`,
        ...(origin === null
          ? {}
          : {
              detail: phrase`${named(name)} is on ${machine(origin)} but not in your clone.`,
            }),
      }
    : importPromptNotice(error, EDIT_PROMPT);
