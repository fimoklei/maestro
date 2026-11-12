import {
  draftPrompt,
  type PromptDraft,
  type PromptPart,
  promptDraftProblems,
  samePrompt,
} from "@maestro/core/prompt-file";
import { useState } from "react";
import { asTyped } from "./prompt-as-typed";
import { promptFieldErrors } from "./prompt-field-errors";

const EMPTY: PromptDraft = {
  name: "",
  frontmatter: "",
  description: "",
  text: "",
  example: "",
};

/** The Prompt text field as the paste finds it. */
export type PasteTarget = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

// Paste text's fields, and whether a submit has judged them.
export function usePastedPrompt() {
  const [draft, setDraft] = useState<PromptDraft>(EMPTY);
  // Which text the one box holds; it opens on the prompt text.
  const [part, setPart] = useState<PromptPart>("text");
  // Errors show from the first submit on, and each clears once its field holds.
  const [submitted, setSubmitted] = useState(false);
  // The name last left; its check speaks only while the field still holds it.
  const [leftName, setLeftName] = useState<string | null>(null);

  const problems = promptDraftProblems(draft);
  // A pasted front matter block lives only as long as the text it came with.
  const edit = (change: Partial<PromptDraft>) =>
    setDraft((current) => ({
      ...current,
      ...change,
      ...(change.text === "" ? { frontmatter: "" } : {}),
    }));

  return {
    draft,
    part,
    showPart: setPart,
    fieldErrors: submitted ? promptFieldErrors(problems) : {},
    /** Over 100 KB once a submit judged it: a notice, not a field error. */
    tooLong: submitted && problems.includes("long-text"),
    changed: draft.name !== "" || !samePrompt(asTyped(draft), EMPTY),
    /** The name to check against the Harness: the one left, while it stands. */
    checkedName: leftName !== null && leftName === draft.name ? leftName : null,
    edit,
    // Left with an invalid name, the check states no error: submit does.
    leaveName: () => setLeftName(draft.name === "" ? null : draft.name),
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
    /** Judges the fields: true when they hold. A refusal shows the prompt text. */
    judge: (): boolean => {
      setSubmitted(true);
      if (problems.length === 0) return true;
      setPart("text");
      return false;
    },
    clear: () => {
      setDraft(EMPTY);
      setPart("text");
      setSubmitted(false);
      setLeftName(null);
    },
  };
}
