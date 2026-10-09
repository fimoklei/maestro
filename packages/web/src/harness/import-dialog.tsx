import { useState } from "react";
import { Dialog } from "../ui/dialog";
import { Field } from "../ui/field";
import { Notice, type NoticeContent } from "../ui/notice";
import { PathField } from "../ui/path-field";
import type { FolderChooser } from "../ui/use-folder-chooser";
import {
  advisoryNotice,
  type ImportCheckLoad,
  importLabels,
  nameBlockerNotice,
  sourceBlockerNotice,
} from "./import-view-model";

export function ImportDialog({
  source,
  sourceText,
  sourceError,
  onSourceChange,
  onSourceCommit,
  chooser,
  name,
  load,
  onNameChange,
  onClose,
  onImport,
  importing,
  importError,
}: {
  /** The folder the check was asked about; null until one is chosen. */
  source: string | null;
  sourceText: string;
  /** The field error a submit left on Folder path. */
  sourceError: string | undefined;
  onSourceChange: (text: string) => void;
  /** A folder to check: picked through Browse, or typed and left. */
  onSourceCommit: (path: string) => void;
  chooser: FolderChooser;
  name: string;
  load: ImportCheckLoad;
  onNameChange: (name: string) => void;
  onClose: () => void;
  onImport: () => void;
  importing: boolean;
  importError: NoticeContent | null;
}) {
  const check = load.kind === "ready" ? load.check : undefined;
  const labels = importLabels(check);
  // Provenance decides the name of an update, so the field states it rather
  // than taking one.
  const locked = check?.mode === "update";
  const sourceProblem =
    load.kind === "error"
      ? load.notice
      : sourceBlockerNotice(check?.sourceBlocker ?? null);
  const nameProblem = nameBlockerNotice(check?.nameBlocker ?? null);
  const nameErrorId = "import-name-error";
  // A click outside must not discard a typed name or path. Once true it
  // stays true: the reader's work is on the panel either way.
  const [nameTouched, setNameTouched] = useState(false);

  return (
    <Dialog
      title={labels.title}
      version={null}
      width={480}
      phase={importing ? "running" : "idle"}
      action={{
        label: labels.confirm,
        verb: labels.verb,
        tone: "primary",
        unavailable: null,
        onRun: onImport,
      }}
      failure={importError}
      // Every field states its own hint and its own refusal beside it.
      describedBy={null}
      fieldsChanged={nameTouched || sourceText !== ""}
      onClose={onClose}
    >
      <div className="flex flex-col gap-inline">
        {/* Checked right after a pick, and once a typed path is left: a
            check per keystroke would refuse half-typed paths (#1013). */}
        <PathField
          label="Folder path"
          hint="Import copies the folder and leaves the original as it is."
          placeholder="/path/to/skill-folder"
          className="placeholder:text-gray-11"
          value={sourceText}
          onChange={onSourceChange}
          onPicked={onSourceCommit}
          onBlur={() => {
            const typed = sourceText.trim();
            if (typed !== "" && typed !== source) onSourceCommit(typed);
          }}
          chooser={chooser}
          error={sourceError}
          disabled={importing}
        />
        <Notice trigger="user-action" notice={sourceProblem} />
      </div>

      <div className="flex flex-col gap-inline">
        {/* The directory name is the skill's identity, so the hint is stated
            before the name is chosen, not explained after a failure. */}
        <Field
          label="Name in the Harness"
          hint={labels.hint}
          value={name}
          onChange={(next) => {
            setNameTouched(true);
            onNameChange(next);
          }}
          disabled={source === null || locked}
          describedBy={nameProblem === null ? undefined : nameErrorId}
          className="font-mono"
        />
        <Notice id={nameErrorId} trigger="user-action" notice={nameProblem} />
      </div>

      <Notice
        trigger="load"
        notice={
          check === undefined
            ? null
            : advisoryNotice(check.advisories, check.mode)
        }
      />
    </Dialog>
  );
}
