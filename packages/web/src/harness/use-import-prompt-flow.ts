import type { ImportMode, ImportPromptSuccess } from "@maestro/core";
import {
  draftPrompt,
  type PromptDraft,
  type PromptPart,
  promptCategory,
  promptDraftProblems,
  samePrompt,
} from "@maestro/core/prompt-file";
import { useState } from "react";
import { useCategoryChoice } from "../categories/use-category-choice";
import { useSubmitAfterAdd } from "../categories/use-held-category-add";
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
import { asTyped } from "./prompt-as-typed";
import { promptFieldErrors } from "./prompt-field-errors";
import { useImportPrompt, useImportPromptCheck } from "./use-harness";

const importedRow = ({ name }: ImportPromptSuccess) =>
  proposalRow({ type: "prompt", name });

const EMPTY: PromptDraft = {
  name: "",
  frontmatter: "",
  description: "",
  text: "",
  example: "",
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

// Import prompt's UI-state: the three fields, and whether a submit has judged
// them. It lives only while the dialog stands, so closing forgets it.
export function useImportPromptFlow(
  screen: ScreenWrites,
  /** Opens the imported row's pane. */
  onImported: (row: string) => void,
  onClose: () => void,
) {
  const [draft, setDraft] = useState<PromptDraft>(EMPTY);
  const [source, setSource] = useState<PromptSource>("paste");
  // Which text the one box holds; the dialog opens on the prompt text.
  const [part, setPart] = useState<PromptPart>("text");
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
    open: true,
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
  const failure: NoticeContent | null =
    category.failure ?? (tooLong ? longTextNotice(confirm) : write.failure);

  const afterAdd = useSubmitAfterAdd(category.field.add, () => {
    write.run(draft, {
      onSuccess: (outcome) =>
        category.save(outcome, () => {
          onClose();
          onImported(importedRow(outcome));
        }),
    });
  });

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
    draft,
    fieldErrors,
    failure,
    mode,
    category,
    takenNotice: mode === "update" ? PROMPT_TAKEN_NOTICE : null,
    // Waiting for a category add shows as the import running.
    phase:
      afterAdd.waiting || category.saving ? ("running" as const) : write.phase,
    /** The import landed and its category did not: only Close is left. */
    outcome: category.failure !== null,
    changed: draft.name !== "" || !samePrompt(asTyped(draft), EMPTY),
    edit,
    source,
    setSource,
    part,
    showPart: setPart,
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
    // draft, its description and example in their fields; text without one
    // pastes as it is, and over the whole text drops the block it replaces.
    // False leaves the paste alone. A taken-over paste is saved with LF, as
    // the browser saves its own.
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
        ...(drafted.example === "" ? {} : { example: drafted.example }),
      });
      return true;
    },
    // Every field error the box can show is the prompt text's.
    submit: () => {
      setSubmitted(true);
      if (problems.length > 0) {
        setPart("text");
        return;
      }
      afterAdd.submit();
    },
    /** After a failure, Close hands the import over as a clean one would. */
    close: () => (category.failure === null ? onClose() : category.leave()),
  };
}
