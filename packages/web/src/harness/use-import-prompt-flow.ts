import {
  draftPrompt,
  type PromptDraft,
  promptFieldProblems,
} from "@maestro/core/prompt-file";
import { useState } from "react";
import type { NoticeContent } from "../ui/notice";
import { useWriteAction } from "../ui/use-write-action";
import {
  importPromptNotice,
  isFieldError,
  LONG_TEXT_NOTICE,
  PROMPT_FIELD_ERRORS,
} from "./import-prompt-copy";
import { type ImportPromptOutcome, useImportPrompt } from "./use-harness";

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

// Import prompt's UI-state: the three fields, and whether a submit has judged them.
export function useImportPromptFlow(
  /** Into the Harness screen's status region. */
  report: (write: string) => void,
  onImported: (outcome: ImportPromptOutcome) => void,
) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PromptDraft>(EMPTY);
  // Errors show from the first submit on, and each clears once its field holds.
  const [submitted, setSubmitted] = useState(false);
  const importPrompt = useImportPrompt();
  const write = useWriteAction(importPrompt, {
    report,
    action: "import",
    show: "row",
    name: (outcome) => outcome.name,
    failure: importPromptNotice,
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
    ? LONG_TEXT_NOTICE
    : write.failure;

  const close = () => {
    setOpen(false);
    setDraft(EMPTY);
    setSubmitted(false);
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
    phase: write.phase,
    changed: draft.name !== "" || draft.description !== "" || draft.text !== "",
    start: () => setOpen(true),
    edit,
    // A pasted front matter block gives up its description and leaves the
    // text; text without one pastes as it is. False leaves the paste alone.
    paste: (next: string): boolean => {
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
