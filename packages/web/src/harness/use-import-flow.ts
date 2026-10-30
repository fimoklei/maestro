import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useCategoryChoice } from "../categories/use-category-choice";
import { useSubmitAfterAdd } from "../categories/use-held-category-add";
import { type ScreenWrites, useWriteAction } from "../ui/use-write-action";
import { FOLDER_MISSING } from "./dialog-copy";
import { proposalRow } from "./harness-route";
import { isImportable } from "./import-view-model";
import { importNotice } from "./notice-copy";
import {
  type ImportOutcome,
  importCheckQuery,
  useImportCheck,
  useImportSkill,
} from "./use-harness";

const importedRow = ({ name }: ImportOutcome) =>
  proposalRow({ type: "skill", name });

// Import skill's UI-state: the folder, the name, and the check both are sent
// to. Every refusal comes from the server's check, so nothing here decides
// one (#576).
export function useImportFlow(
  screen: ScreenWrites,
  /** Opens the imported row's pane. */
  onImported: (row: string) => void,
) {
  const [open, setOpen] = useState(false);
  // What the Folder path field holds, and the folder last sent to the check.
  const [sourceText, setSourceText] = useState("");
  const [source, setSource] = useState<string | null>(null);
  // Set by a submit with no folder; any edit of the field clears it.
  const [folderMissing, setFolderMissing] = useState(false);
  // Null until the author types: Maestro's proposal fills the field until then,
  // and a new folder brings a new proposal.
  const [editedName, setEditedName] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const check = useImportCheck(source, editedName);
  const importSkill = useImportSkill();
  const importWrite = useWriteAction(importSkill, {
    screen,
    action: "import",
    subject: (outcome) => ({ name: outcome.name, row: importedRow(outcome) }),
    failure: importNotice,
  });
  // An update's name is the recorded skill's own: provenance decides it, so a
  // name typed before the check came back never travels with it (#732).
  const name =
    check.data?.mode === "update"
      ? check.data.name
      : (editedName ?? check.data?.name ?? "");
  const category = useCategoryChoice({
    type: "skill",
    name,
    mode: check.data?.mode ?? "add",
    fromFile: check.data?.category ?? null,
    open,
  });

  // Imports only a folder whose check came back clean: a check under way is
  // awaited and a failed one asked again, so a submit is never silent. A new
  // typed folder is checked; a refusal stays beside its field.
  const submitNow = async () => {
    const typed = sourceText.trim();
    if (typed === "") {
      setFolderMissing(true);
      return;
    }
    if (typed !== source) {
      commitSource(typed);
      return;
    }
    // A failed check states itself beside Folder path; so does a refusal.
    const checked =
      check.data ??
      (await queryClient
        .fetchQuery(importCheckQuery(typed, editedName))
        .catch(() => undefined));
    if (checked === undefined || !isImportable(checked)) return;
    importWrite.run(
      {
        source: typed,
        name:
          checked.mode === "update"
            ? checked.name
            : (editedName ?? checked.name),
      },
      {
        onSuccess: (outcome) => {
          close();
          category.save(outcome);
          onImported(importedRow(outcome));
        },
      },
    );
  };
  const afterAdd = useSubmitAfterAdd(category.field.add, () => {
    void submitNow();
  });

  const close = () => {
    setOpen(false);
    setSource(null);
    setSourceText("");
    setFolderMissing(false);
    setEditedName(null);
    importSkill.reset();
    category.reset();
  };

  const commitSource = (path: string) => {
    setSource(path);
    setEditedName(null);
    importSkill.reset();
  };

  return {
    open,
    source,
    sourceText,
    sourceError: folderMissing ? FOLDER_MISSING : undefined,
    name,
    check,
    importWrite,
    category,
    start: () => setOpen(true),
    setSourceText: (text: string) => {
      setFolderMissing(false);
      setSourceText(text);
    },
    commitSource,
    setEditedName,
    /** The import runs, or waits for a category add to land first. */
    importing: importWrite.phase === "running" || afterAdd.waiting,
    submit: afterAdd.submit,
    close,
  };
}
