import type { EditPromptError } from "@maestro/core";
import type { PromptFieldProblem, PromptPart } from "@maestro/core/prompt-file";
import { HttpError } from "../api/http";
import { CHANGE_LOCATION_STEP } from "../settings/settings-copy";
import { HARNESS_BUSY } from "../ui/busy-copy";
import { EDIT_PROMPT, RESTORE_LABEL, rereadLabel } from "../ui/control-labels";
import { CLOSE } from "../ui/dialog-copy";
import type { NoticeContent } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";
import { machine, named, phrase, plainText } from "../ui/phrase";
import { ITEM_WORDS } from "./item-words";
import { harnessHeadings, invalidNameHeading } from "./notice-copy";

/** The one hint the prompt box shows, under Example. */
export const EXAMPLE_HINT = "Optional example prompt.";

/** The accessible name of the Prompt text / Example switch. */
export const PROMPT_BOX_LABEL = "Prompt text or example";

/** Each part's word: its segment, and the box's name while it shows. */
export const PROMPT_BOX_WORDS: Record<PromptPart, string> = {
  text: "Prompt text",
  example: "Example",
};

export const PROMPT_BOX_PARTS: readonly {
  value: PromptPart;
  label: string;
}[] = [
  { value: "text", label: PROMPT_BOX_WORDS.text },
  { value: "example", label: PROMPT_BOX_WORDS.example },
];

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

type NoticeCode = Exclude<
  EditPromptError,
  FieldError | "prompt-missing" | "prompt-changed"
>;

const EDIT_OUTCOME = {
  nothing: "Nothing was edited.",
  heading: "Prompt not edited",
};

/** The edit dialog's title, on the prompt the reader chose. */
export const editPromptTitle = (prompt: string) => `Edit ${prompt}`;

/** Why Edit prompt is blocked while both fields hold what was read. */
export const NOTHING_CHANGED =
  "Change the description, text, example or category.";

/** The text over 100 KB, refused before any request; `confirm` names the button. */
export const longTextNotice = (confirm: string) => ({
  level: "error" as const,
  label: "Prompt over 100 KB",
  message: `Shorten the text to 100 KB or less. Then select ${confirm}.`,
});

const EDIT_HEADINGS: NoticeTable<NoticeCode> = {
  "not-configured": {
    ...harnessHeadings["not-configured"],
    message: `${CHANGE_LOCATION_STEP}, then select ${EDIT_PROMPT} again.`,
  },
  "long-text": longTextNotice(EDIT_PROMPT),
  "destination-unsafe": {
    level: "error",
    label: "Link in the Harness",
    message: `${EDIT_OUTCOME.nothing} Replace the link with a real file or folder, then select ${EDIT_PROMPT} again.`,
    detail: "The .maestro/prompts folder or the prompt file is a link.",
  },
  "destination-unreadable": {
    level: "error",
    label: "Prompts folder not read",
    message: `${EDIT_OUTCOME.nothing} Make the Harness clone readable, then select ${EDIT_PROMPT} again.`,
  },
  "import-in-progress": {
    level: "error",
    label: HARNESS_BUSY,
    message: `Wait for that change to finish, then select ${EDIT_PROMPT} again.`,
    detail: "Maestro changes one Harness at a time.",
  },
  "write-failed": {
    level: "error",
    label: EDIT_OUTCOME.heading,
    message: `The Harness is as it was. Make the prompts folder writable, then select ${EDIT_PROMPT} again.`,
  },
};

// The edge refuses a broken field as a request-shape notice; the dialog
// checks the same rules first, so only the codes below reach this table.
const promptWriteNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(EDIT_HEADINGS, error, {
    label: EDIT_OUTCOME.heading,
    message: `The Maestro server did not answer, and nothing reached the Harness. Select ${EDIT_PROMPT} again.`,
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
  const { nothing } = EDIT_OUTCOME;
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
  return promptWriteNotice(error);
};

/** A read on the Harness screen that opened no dialog. */
export const harnessPromptReadNotice = (
  error: unknown,
): NoticeContent | null =>
  refusedWith(error, "prompt-missing")
    ? {
        level: "error",
        label: NOT_IN_CLONE,
        message: `${EDIT_OUTCOME.nothing} ${RESTORE_STEP.harness}`,
      }
    : promptWriteNotice(error);

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
    : promptWriteNotice(error);
