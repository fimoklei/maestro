import type { PromptImportOutcome } from "@maestro/core";
import {
  draftPrompt,
  type PromptDraft,
  promptCategory,
  promptDraftProblems,
} from "@maestro/core/prompt-file";
import { useState } from "react";
import { useSubmitAfterAdd } from "../categories/use-held-category-add";
import type { ReportGroup } from "../ui/report";
import type { ImportRow } from "./import-checklist-groups";
import type { PromptFileRefusal } from "./import-prompts-copy";
import { useImportPromptChecks, useImportPrompts } from "./use-harness";
import { useImportChecklist } from "./use-import-checklist";

/**
 * One chosen file: its fields, or null where it is not UTF-8 text. The label
 * is the prompt name, or the file name where none survives.
 */
type ChosenPrompt = { key: string; label: string; draft: PromptDraft | null };

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

/** What the import did, with the categories it could not save. */
type PromptsImportReport = {
  outcomes: readonly PromptImportOutcome[];
  unsavedCategories: readonly ReportGroup[];
};

// Import prompts' UI-state: the chosen files, which are checked, and the run.
// It lives only while the dialog stands, so closing forgets it.
export function useImportPromptsFlow(onClose: () => void) {
  const [chosen, setChosen] = useState<readonly ChosenPrompt[] | null>(null);
  const importPrompts = useImportPrompts();
  // Set once the landed rows' categories are saved too.
  const [report, setReport] = useState<PromptsImportReport | null>(null);
  const [savingCategories, setSavingCategories] = useState(false);
  const clearRun = () => {
    importPrompts.reset();
    setReport(null);
  };

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
  const rows: ImportRow<PromptFileRefusal>[] = judged.map(
    ({ file, problem }) => {
      let refusal: PromptFileRefusal | null = problem;
      const name = file.draft?.name ?? "";
      if (refusal === null && seen.has(name)) refusal = "same-name";
      if (refusal === null) seen.add(name);
      return {
        key: file.key,
        name: file.label,
        refusal,
        held: refusal === null && taken.has(name),
        fileCategory:
          file.draft === null ? null : promptCategory(file.draft.frontmatter),
      };
    },
  );
  const checklist = useImportChecklist(
    chosen,
    chosen === null ? null : rows,
    "prompt",
  );
  const toSend = checklist.picked.flatMap(({ key, replace }) => {
    const draft = chosen?.find((file) => file.key === key)?.draft;
    return draft ? [{ key, draft: { ...draft, replace } }] : [];
  });

  const submit = () => {
    if (toSend.length === 0) return;
    importPrompts.mutate(
      toSend.map(({ draft }) => draft),
      {
        onSuccess: ({ outcomes }) => {
          setSavingCategories(true);
          void checklist
            .saveCategories(
              outcomes.flatMap((outcome) => {
                const sent = toSend.find(
                  ({ draft }) => draft.name === outcome.name,
                );
                return outcome.imported && sent !== undefined
                  ? [{ key: sent.key, name: outcome.name }]
                  : [];
              }),
            )
            .then((unsavedCategories) => {
              setReport({ outcomes, unsavedCategories });
              setSavingCategories(false);
            });
        },
      },
    );
  };
  const afterAdd = useSubmitAfterAdd(checklist.categoryAdd, submit);

  return {
    checklist: {
      ...checklist,
      toggle: (key: string) => {
        clearRun();
        checklist.toggle(key);
      },
    },
    running: importPrompts.isPending || savingCategories || afterAdd.waiting,
    report,
    error: importPrompts.error,
    // A new pick replaces the list the last one gave.
    chooseFiles: async (files: readonly File[]) => {
      const read = await Promise.all(files.map(readChosen));
      clearRun();
      setChosen(read);
    },
    submit: afterAdd.submit,
    close: onClose,
  };
}
