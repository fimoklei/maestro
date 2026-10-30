import type { ImportMode, ImportPromptSuccess } from "@maestro/core";
import {
  draftPrompt,
  type PromptDraft,
  promptCategory,
  promptDraftProblems,
} from "@maestro/core/prompt-file";
import { useState } from "react";
import { useCategoryChoice } from "../categories/use-category-choice";
import type { NoticeContent } from "../ui/notice";
import { type ScreenWrites, useWriteAction } from "../ui/use-write-action";
import { proposalRow } from "./harness-route";
import {
  importPromptNotice,
  longTextNotice,
  NOT_TEXT_FILE_NOTICE,
  PROMPT_IMPORT_MODES,
  PROMPT_TAKEN_NOTICE,
  type PromptSource,
} from "./import-prompt-copy";
import { promptFieldErrors } from "./prompt-field-errors";
import { useImportPrompt, useImportPromptCheck } from "./use-harness";

const importedRow = ({ name }: ImportPromptSuccess) =>
  proposalRow({ type: "prompt", name });

const EMPTY: PromptDraft = {
  name: "",
  frontmatter: "",
  description: "",
  text: "",
};

/** The file last chosen, as the Choose file tab shows it. */
export type ChosenFile = { name: string; bytes: number; isText: boolean };

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** The Prompt text field as the paste finds it. */
export type PasteTarget = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

export type ImportPromptFlow = ReturnType<typeof useImportPromptFlow>;

// Import prompt's UI-state: the three fields, and whether a submit has judged them.
export function useImportPromptFlow(
  screen: ScreenWrites,
  /** Opens the imported row's pane. */
  onImported: (row: string) => void,
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
  const mode: ImportMode =
    checkedName === draft.name && check.data?.mode === "update"
      ? "update"
      : "add";
  const { confirm } = PROMPT_IMPORT_MODES[mode];
  const category = useCategoryChoice({
    type: "prompt",
    name: draft.name,
    mode,
    fromFile: promptCategory(draft.frontmatter),
    open,
  });
  const importPrompt = useImportPrompt();
  const write = useWriteAction(importPrompt, {
    screen,
    action: "import",
    subject: (outcome) => ({ name: outcome.name, row: importedRow(outcome) }),
    failure: (error) => importPromptNotice(error, confirm),
  });

  const problems = promptDraftProblems(draft);
  const fieldErrors = submitted ? promptFieldErrors(problems) : {};
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
    category.reset();
  };

  // A pasted front matter block lives only as long as the text it came with.
  const edit = (change: Partial<PromptDraft>) => {
    importPrompt.reset();
    setDraft((current) => ({
      ...current,
      ...change,
      ...(change.text === "" ? { frontmatter: "" } : {}),
    }));
  };

  return {
    open,
    draft,
    fieldErrors,
    failure,
    mode,
    category,
    takenNotice: mode === "update" ? PROMPT_TAKEN_NOTICE : null,
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
    // A pasted front matter block leaves the text and travels with the
    // draft, its description in the field; text without one pastes as it is,
    // and over the whole text drops the block it replaces. False leaves the
    // paste alone. A taken-over paste is saved with LF, as the browser saves
    // its own.
    paste: (field: PasteTarget, pasted: string): boolean => {
      const next =
        field.value.slice(0, field.selectionStart) +
        pasted.replace(/\r\n?/g, "\n") +
        field.value.slice(field.selectionEnd);
      const drafted = draftPrompt(next, null);
      if (drafted.text === next) {
        if (
          field.selectionStart === 0 &&
          field.selectionEnd === field.value.length
        ) {
          edit({ frontmatter: "" });
        }
        return false;
      }
      edit({
        frontmatter: drafted.frontmatter,
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
          category.save(outcome);
          onImported(importedRow(outcome));
        },
      });
    },
    close,
  };
}
