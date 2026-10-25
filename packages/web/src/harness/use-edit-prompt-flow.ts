import {
  type PromptFile,
  promptFieldProblems,
} from "@maestro/core/prompt-file";
import { useState } from "react";
import { EDIT_PROMPT } from "../ui/control-labels";
import type { NoticeContent } from "../ui/notice";
import { useWriteAction, type WriteResult } from "../ui/use-write-action";
import { proposalRow } from "./harness-route";
import {
  type EditScreen,
  editPromptNotice,
  longTextNotice,
  NOTHING_CHANGED,
} from "./import-prompt-copy";
import { useEditPrompt, useReadPrompt } from "./use-harness";
import { promptFieldErrors } from "./use-import-prompt-flow";

// A browser text field holds LF only, so the read is compared as it shows.
const lf = (text: string) => text.replace(/\r\n?/g, "\n");

/** The prompt the dialog edits, as the Working Harness gave it. */
type Opened = { name: string; read: PromptFile };

// Edit prompt's UI-state: the read that opened it, the two fields, and
// whether a submit has judged them.
export function useEditPromptFlow({
  screen,
  report,
  onEdited,
}: {
  /** The screen the edit starts on. */
  screen: EditScreen;
  /** Its status region. */
  report: (write: string) => void;
  /** Takes the result to the Harness view, where the edited row is. */
  onEdited: (name: string, written: WriteResult) => void;
}) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [fields, setFields] = useState<PromptFile>({
    description: "",
    text: "",
  });
  // Errors show from the first submit on, and each clears once its field holds.
  const [submitted, setSubmitted] = useState(false);
  const reading = useReadPrompt();
  const editing = useEditPrompt();
  const write = useWriteAction(editing, {
    report,
    action: "edit",
    subject: ({ name }) => ({
      name,
      row: proposalRow({ type: "prompt", name }),
    }),
    handOver: (written, { name }) => onEdited(name, written),
    failure: (error) =>
      editPromptNotice(error, { name: opened?.name ?? "", screen }),
  });

  const name = opened?.name ?? "";
  const draft = { name, ...fields };
  const problems = promptFieldProblems(draft);
  const tooLong = submitted && problems.includes("long-text");
  const failure: NoticeContent | null = tooLong
    ? longTextNotice(EDIT_PROMPT)
    : write.failure;
  const changed =
    opened !== null &&
    (fields.description !== opened.read.description ||
      fields.text !== lf(opened.read.text));

  const close = () => {
    setOpened(null);
    setSubmitted(false);
    editing.reset();
  };

  return {
    open: opened !== null,
    name,
    draft,
    fieldErrors: submitted ? promptFieldErrors(problems) : {},
    failure,
    phase: write.phase,
    changed,
    unavailable: changed ? null : NOTHING_CHANGED,
    /** The prompt a refused read was for, and why; the screen states it. */
    readRefusal:
      reading.isError && reading.variables !== undefined
        ? { name: reading.variables, error: reading.error }
        : null,
    // The dialog opens only once the Working Harness answered.
    start: (prompt: string, onRefused: () => void) =>
      reading.mutate(prompt, {
        onError: onRefused,
        onSuccess: (read) => {
          setOpened({ name: prompt, read });
          setFields({ description: read.description, text: lf(read.text) });
          setSubmitted(false);
          editing.reset();
        },
      }),
    edit: (change: Partial<PromptFile>) => {
      editing.reset();
      setFields((current) => ({ ...current, ...change }));
    },
    submit: () => {
      if (opened === null) return;
      setSubmitted(true);
      if (problems.length > 0) return;
      write.run({ ...draft, read: opened.read }, { onSuccess: () => close() });
    },
    close,
  };
}
