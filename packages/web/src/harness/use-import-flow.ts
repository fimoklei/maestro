import { useState } from "react";
import { useWriteAction } from "../ui/use-write-action";
import { FOLDER_MISSING } from "./dialog-copy";
import { isImportable } from "./import-view-model";
import { importNotice } from "./notice-copy";
import {
  type ImportOutcome,
  useImportCheck,
  useImportSkill,
} from "./use-harness";

// Import skill's UI-state: the folder, the name, and the check both are sent
// to. Every refusal comes from the server's check, so nothing here decides
// one (#576).
export function useImportFlow(
  /** Into the Harness screen's status region. */
  report: (write: string) => void,
  onImported: (outcome: ImportOutcome) => void,
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
  const check = useImportCheck(source, editedName);
  const importSkill = useImportSkill();
  const importWrite = useWriteAction(importSkill, {
    report,
    action: "import",
    show: "row",
    name: (outcome) => outcome.name,
    failure: importNotice,
  });
  // An update's name is the recorded skill's own: provenance decides it, so a
  // name typed before the check came back never travels with it (#732).
  const name =
    check.data?.mode === "update"
      ? check.data.name
      : (editedName ?? check.data?.name ?? "");

  const close = () => {
    setOpen(false);
    setSource(null);
    setSourceText("");
    setFolderMissing(false);
    setEditedName(null);
    importSkill.reset();
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
    start: () => setOpen(true),
    setSourceText: (text: string) => {
      setFolderMissing(false);
      setSourceText(text);
    },
    commitSource,
    setEditedName,
    // Imports only a folder whose check came back clean; any other submit
    // checks the typed folder, or leaves the refusal beside its field.
    submit: () => {
      const typed = sourceText.trim();
      if (typed === "") {
        setFolderMissing(true);
        return;
      }
      if (typed !== source) {
        commitSource(typed);
        return;
      }
      if (source === null || !isImportable(check.data)) return;
      importWrite.run(
        { source, name },
        {
          onSuccess: (outcome) => {
            close();
            onImported(outcome);
          },
        },
      );
    },
    close,
  };
}
