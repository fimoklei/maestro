import {
  type PromptFile,
  promptFieldProblems,
} from "@maestro/core/prompt-file";
import { useState } from "react";
import { CATEGORY_NOT_SET_AFTER_EDIT } from "../categories/categories-copy";
import { assignFailure } from "../categories/category-refusals";
import {
  type CategoryAssignment,
  sharedCategory,
  useAssignCategory,
  useCategoriesWhile,
} from "../categories/use-categories";
import {
  useHeldCategoryAdd,
  useSubmitAfterAdd,
} from "../categories/use-held-category-add";
import { EDIT_PROMPT, rereadLabel } from "../ui/control-labels";
import type { NoticeContent } from "../ui/notice";
import {
  type ScreenWrites,
  useWriteAction,
  type WriteResult,
} from "../ui/use-write-action";
import { proposalRow } from "./harness-route";
import {
  type EditScreen,
  editPromptNotice,
  longTextNotice,
  NOTHING_CHANGED,
} from "./import-prompt-copy";
import { promptFieldErrors } from "./prompt-field-errors";
import { useEditPrompt, useReadPrompt } from "./use-harness";

// A browser text field holds LF only, so the read is compared as it shows.
const lf = (text: string) => text.replace(/\r\n?/g, "\n");

/** The prompt the dialog edits, as the Working Harness gave it. */
type Opened = { name: string; read: PromptFile };

/** An edit that landed in the Harness while its category did not; Close hands it over. */
type Landed = { name: string; written: WriteResult };

const SCREEN_NAME: Record<EditScreen, string> = {
  harness: "Harness",
  prompts: "Prompts",
};

export type EditPromptFlow = ReturnType<typeof useEditPromptFlow>;

// Edit prompt's UI-state: the read that opened it, the fields, and whether a
// submit has judged them. A change of the category alone never writes the
// Harness: it goes to the assign route only.
export function useEditPromptFlow({
  screen,
  writes,
  onEdited,
}: {
  /** The screen the edit starts on. */
  screen: EditScreen;
  /** Its table screen's writes. */
  writes: ScreenWrites;
  /** Takes the result to the Harness view, where the edited row is. */
  onEdited: (name: string, written: WriteResult) => void;
}) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [fields, setFields] = useState<PromptFile>({
    description: "",
    text: "",
  });
  // Undefined until the reader picks: the field shows the saved category.
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [landed, setLanded] = useState<Landed | null>(null);
  // Errors show from the first submit on, and each clears once its field holds.
  const [submitted, setSubmitted] = useState(false);
  const reading = useReadPrompt();
  const editing = useEditPrompt();
  // Read once the dialog opens, never by the screen behind it.
  const categories = useCategoriesWhile(opened !== null);
  const assigning = useAssignCategory();
  const reread = rereadLabel(SCREEN_NAME[screen]);
  const pickCategory = (next: string | null) => {
    assigning.reset();
    setChosen(next);
  };
  const categoryAdd = useHeldCategoryAdd(pickCategory);

  const name = opened?.name ?? "";
  const saved =
    opened === null
      ? null
      : (sharedCategory(categories.data?.assignments ?? [], [
          { type: "prompt", name },
        ]) ?? null);
  const category = chosen === undefined ? saved : chosen;
  const categoryChanged = chosen !== undefined && chosen !== saved;
  const fieldsChanged =
    opened !== null &&
    (fields.description !== opened.read.description ||
      fields.text !== lf(opened.read.text));

  const close = () => {
    setOpened(null);
    setSubmitted(false);
    setChosen(undefined);
    setLanded(null);
    editing.reset();
    assigning.reset();
    categoryAdd.reset();
  };

  const assignTo = (prompt: string): CategoryAssignment => ({
    items: [{ type: "prompt", name: prompt }],
    category,
  });

  // After the Harness write: the category follows the name the edit answers with.
  const handOver = (written: WriteResult, edited: string) => {
    const done = () => {
      onEdited(edited, written);
      close();
    };
    const renamed = edited !== name;
    if (!categoryChanged && !(renamed && category !== null)) {
      done();
      return;
    }
    assigning.mutate(assignTo(edited), {
      onSuccess: done,
      onError: () => setLanded({ name: edited, written }),
    });
  };

  const write = useWriteAction(editing, {
    report: writes.report,
    action: "edit",
    subject: ({ name: edited }) => ({
      name: edited,
      row: proposalRow({ type: "prompt", name: edited }),
    }),
    handOver: (written, { name: edited }) => handOver(written, edited),
    failure: (error) => editPromptNotice(error, { name, screen }),
  });
  // A category change alone: the row stays where it is, and only Prompts shows it.
  const categoryWrite = useWriteAction(assigning, {
    screen: writes,
    action: "setCategory",
    subject: () => ({ name, row: screen === "prompts" ? name : null }),
    failure: (error) =>
      assignFailure(error, { type: "prompt", count: 1, reread }),
  });

  const draft = { name, ...fields };
  const problems = promptFieldProblems(draft);
  const tooLong = submitted && problems.includes("long-text");
  const failure: NoticeContent | null =
    landed !== null
      ? CATEGORY_NOT_SET_AFTER_EDIT
      : tooLong
        ? longTextNotice(EDIT_PROMPT)
        : (write.failure ?? categoryWrite.failure);
  const changed = fieldsChanged || categoryChanged;
  const afterAdd = useSubmitAfterAdd(categoryAdd, () => {
    if (opened === null) return;
    if (!fieldsChanged) {
      categoryWrite.run(assignTo(name), { onSuccess: () => close() });
      return;
    }
    write.run({ ...draft, read: opened.read });
  });

  return {
    open: opened !== null,
    name,
    draft,
    /** Undefined until the categories are read. */
    category: categories.data === undefined ? undefined : category,
    fieldErrors: submitted ? promptFieldErrors(problems) : {},
    failure,
    phase:
      write.phase === "running" || assigning.isPending || afterAdd.waiting
        ? ("running" as const)
        : ("idle" as const),
    /** The edit landed and its category did not: only Close is left. */
    outcome: landed !== null,
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
          setChosen(undefined);
          setLanded(null);
          setSubmitted(false);
          editing.reset();
          assigning.reset();
        },
      }),
    edit: (change: Partial<PromptFile>) => {
      editing.reset();
      setFields((current) => ({ ...current, ...change }));
    },
    pickCategory,
    categoryAdd,
    submit: () => {
      if (opened === null) return;
      setSubmitted(true);
      if (problems.length > 0) return;
      afterAdd.submit();
    },
    close: () => {
      if (landed !== null) onEdited(landed.name, landed.written);
      close();
    },
  };
}
