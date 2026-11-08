import {
  draftPrompt,
  type PromptDraft,
  promptDraftProblems,
} from "@maestro/core/prompt-file";
import { useState } from "react";
import type { PromptFileRefusal } from "./import-prompts-copy";
import { useImportPromptChecks, useImportPrompts } from "./use-harness";

/** One chosen file: its fields, or null where it is not UTF-8 text. */
type ChosenPrompt = { key: string; label: string; draft: PromptDraft | null };

/** A chosen file as the checklist lists it. */
type PromptFileRow = {
  key: string;
  /** The prompt name, or the file name where none survives. */
  label: string;
  refusal: PromptFileRefusal | null;
};

const utf8 = new TextDecoder("utf-8", { fatal: true });

// The text stays as the file holds it, as the single import keeps it.
async function readChosen(file: File, index: number): Promise<ChosenPrompt> {
  const name = draftPrompt("", file.name).name;
  const label = name === "" ? file.name : name;
  try {
    const raw = utf8.decode(await file.arrayBuffer());
    return { key: String(index), label, draft: draftPrompt(raw, file.name) };
  } catch {
    return { key: String(index), label, draft: null };
  }
}

export type ImportPromptsFlow = ReturnType<typeof useImportPromptsFlow>;

// Import prompts' UI-state: the chosen files, which are checked, and the run.
export function useImportPromptsFlow() {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<readonly ChosenPrompt[] | null>(null);
  // Unchecked rather than checked: a file that can run starts checked.
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const importPrompts = useImportPrompts();

  // The single import's field rules, first broken rule only, in field order.
  const judged = (chosen ?? []).map((file) => ({
    file,
    problem:
      file.draft === null
        ? ("not-text" as const)
        : (promptDraftProblems(file.draft)[0] ?? null),
  }));
  const names = [
    ...new Set(
      judged.flatMap(({ file, problem }) =>
        problem === null && file.draft !== null ? [file.draft.name] : [],
      ),
    ),
  ];
  // A check not yet answered, or failed, reads as free: the import judges
  // the name again.
  const checks = useImportPromptChecks(names);
  const taken = new Set(
    names.filter((_, index) => checks[index]?.data?.mode === "update"),
  );
  const seen = new Set<string>();
  const rows: PromptFileRow[] = judged.map(({ file, problem }) => {
    let refusal: PromptFileRefusal | null = problem;
    const name = file.draft?.name ?? "";
    if (refusal === null && taken.has(name)) refusal = "prompt-taken";
    if (refusal === null && seen.has(name)) refusal = "same-name";
    if (refusal === null) seen.add(name);
    return { key: file.key, label: file.label, refusal };
  });
  const toSend = rows.flatMap((row) => {
    const draft = chosen?.find((file) => file.key === row.key)?.draft;
    return row.refusal === null && !unchecked.has(row.key) && draft
      ? [draft]
      : [];
  });

  const close = () => {
    setOpen(false);
    setChosen(null);
    setUnchecked(new Set());
    importPrompts.reset();
  };

  return {
    open,
    rows: chosen === null ? null : rows,
    checked: new Set(
      rows.flatMap((row) =>
        row.refusal === null && !unchecked.has(row.key) ? [row.key] : [],
      ),
    ),
    running: importPrompts.isPending,
    report: importPrompts.data?.outcomes ?? null,
    error: importPrompts.error,
    start: () => setOpen(true),
    // A new pick replaces the list the last one gave.
    chooseFiles: async (files: readonly File[]) => {
      const read = await Promise.all(files.map(readChosen));
      importPrompts.reset();
      setUnchecked(new Set());
      setChosen(read);
    },
    toggle: (key: string) => {
      importPrompts.reset();
      setUnchecked((current) => {
        const next = new Set(current);
        if (!next.delete(key)) next.add(key);
        return next;
      });
    },
    submit: () => {
      if (toSend.length > 0) importPrompts.mutate(toSend);
    },
    close,
  };
}
