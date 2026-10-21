import {
  draftPrompt,
  type PromptDraft,
  promptFieldProblems,
} from "@maestro/core/prompt-file";
import { useState } from "react";
import { IMPORT_PROMPT, UPDATE_PROMPT } from "../ui/control-labels";
import type { NoticeContent } from "../ui/notice";
import { useWriteAction } from "../ui/use-write-action";
import {
  importPromptNotice,
  isFieldError,
  longTextNotice,
  NOT_TEXT_FILE_NOTICE,
  PROMPT_FIELD_ERRORS,
  PROMPT_TAKEN_NOTICE,
  type PromptSource,
} from "./import-prompt-copy";
import {
  type ImportPromptOutcome,
  useImportPrompt,
  useImportPromptCheck,
} from "./use-harness";

const EMPTY: PromptDraft = { name: "", description: "", text: "" };

const PROBLEM_FIELD: Record<
  keyof typeof PROMPT_FIELD_ERRORS,
  keyof PromptDraft
> = {
  "empty-name": "name",
  "invalid-name": "name",
  "empty-description": "description",
  "multiline-description": "description",
  "long-description": "description",
  "empty-text": "text",
};

export type PromptFieldErrors = Partial<Record<keyof PromptDraft, string>>;

/** The file last chosen, as the Choose file tab shows it. */
export type ChosenFile = { name: string; bytes: number; isText: boolean };

const utf8 = new TextDecoder("utf-8", { fatal: true });

// Import prompt's UI-state: the three fields, and whether a submit has judged them.
export function useImportPromptFlow(
  /** Into the Harness screen's status region. */
  report: (write: string) => void,
  onImported: (outcome: ImportPromptOutcome) => void,
) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PromptDraft>(EMPTY);
  const [source, setSource] = useState<PromptSource>("paste");
  const [chosenFile, setChosenFile] = useState<ChosenFile | null>(null);
  // Errors show from the first submit on, and each clears once its field holds.
  const [submitted, setSubmitted] = useState(false);
  // The name last left; its check speaks only while the field still holds it.
  const [checkedName, setCheckedName] = useState<string | null>(null);
  const check = useImportPromptCheck(checkedName);
  // A failed check reads as adding: the import itself states any refusal.
  const updating = checkedName === draft.name && check.data?.mode === "update";
  const confirm = updating ? UPDATE_PROMPT : IMPORT_PROMPT;
  const importPrompt = useImportPrompt();
  const write = useWriteAction(importPrompt, {
    report,
    action: "import",
    show: "row",
    name: (outcome) => outcome.name,
    failure: (error) => importPromptNotice(error, confirm),
  });

  const problems = promptFieldProblems(draft);
  const fieldErrors: PromptFieldErrors = {};
  if (submitted) {
    for (const problem of problems) {
      if (!isFieldError(problem)) continue;
      fieldErrors[PROBLEM_FIELD[problem]] ??= PROMPT_FIELD_ERRORS[problem];
    }
  }
  const tooLong = submitted && problems.includes("long-text");
  const failure: NoticeContent | null = tooLong
    ? longTextNotice(confirm)
    : write.failure;

  const close = () => {
    setOpen(false);
    setDraft(EMPTY);
    setSource("paste");
    setChosenFile(null);
    setSubmitted(false);
    setCheckedName(null);
    importPrompt.reset();
  };

  const edit = (change: Partial<PromptDraft>) => {
    importPrompt.reset();
    setDraft((current) => ({ ...current, ...change }));
  };

  return {
    open,
    draft,
    fieldErrors,
    failure,
    updating,
    takenNotice: updating ? PROMPT_TAKEN_NOTICE : null,
    phase: write.phase,
    changed: draft.name !== "" || draft.description !== "" || draft.text !== "",
    start: () => setOpen(true),
    edit,
    source,
    setSource,
    chosenFile,
    fileNotice: chosenFile?.isText === false ? NOT_TEXT_FILE_NOTICE : null,
    // The text stays as the file holds it, CRLF included, until the field is
    // edited; a refused file leaves the fields as they were.
    chooseFile: async (file: File) => {
      let raw: string;
      try {
        raw = utf8.decode(await file.arrayBuffer());
      } catch {
        setChosenFile({ name: file.name, bytes: file.size, isText: false });
        return;
      }
      setChosenFile({ name: file.name, bytes: file.size, isText: true });
      const drafted = draftPrompt(raw, file.name);
      edit(drafted);
      setCheckedName(drafted.name === "" ? null : drafted.name);
    },
    // Left with an invalid name, the check states no error: submit does.
    checkName: () => setCheckedName(draft.name === "" ? null : draft.name),
    // A pasted front matter block gives up its description and leaves the
    // text; text without one pastes as it is. False leaves the paste alone.
    // A taken-over paste is saved with LF, as the browser saves its own.
    paste: (pasted: string): boolean => {
      const next = pasted.replace(/\r\n?/g, "\n");
      const drafted = draftPrompt(next, null);
      if (drafted.text === next) return false;
      edit({
        text: drafted.text,
        ...(drafted.description === ""
          ? {}
          : { description: drafted.description }),
      });
      return true;
    },
    submit: () => {
      setSubmitted(true);
      if (problems.length > 0) return;
      write.run(draft, {
        onSuccess: (outcome) => {
          close();
          onImported(outcome);
        },
      });
    },
    close,
  };
}
