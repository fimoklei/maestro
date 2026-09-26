import { useState } from "react";
import {
  type ImportOutcome,
  useImportCheck,
  useImportSkill,
} from "./use-harness";

// Import skill…'s UI-state: the folder, the name, and the check both are sent
// to. Every refusal comes from the server's check, so nothing here decides
// one (#576).
export function useImportFlow(onImported: (outcome: ImportOutcome) => void) {
  const [open, setOpen] = useState(false);
  // What the Folder path field holds, and the folder last sent to the check.
  const [sourceText, setSourceText] = useState("");
  const [source, setSource] = useState<string | null>(null);
  // Null until the author types: Maestro's proposal fills the field until then,
  // and a new folder brings a new proposal.
  const [editedName, setEditedName] = useState<string | null>(null);
  const check = useImportCheck(source, editedName);
  const importSkill = useImportSkill();
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
    setEditedName(null);
    importSkill.reset();
  };

  return {
    open,
    source,
    sourceText,
    name,
    check,
    importSkill,
    start: () => setOpen(true),
    setSourceText,
    commitSource: (path: string) => {
      setSource(path);
      setEditedName(null);
      importSkill.reset();
    },
    setEditedName,
    submit: () => {
      if (source === null) return;
      importSkill.mutate(
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
