import { useState } from "react";
import { Button } from "../ui/button";
import { DIALOG_FOOTER, DialogShell } from "../ui/dialog-shell";
import { Field } from "../ui/field";
import { Notice, type NoticeContent } from "../ui/notice";
import { PathField } from "../ui/path-field";
import type { FolderChooser } from "../ui/use-folder-chooser";
import {
  advisoryTexts,
  importEnabled,
  importLabels,
  nameBlockerNotice,
  sourceBlockerNotice,
} from "./import-view-model";
import type { ImportCheck } from "./use-harness";

// The check travels with its loading and error states so the modal stays
// mounted across them — a focus trap that unmounts loses the author's place.
export type ImportCheckLoad =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; notice: NoticeContent }
  | { kind: "ready"; check: ImportCheck };

export function ImportDialog({
  source,
  sourceText,
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
  const advisories = advisoryTexts(check?.advisories ?? []);
  const nameErrorId = "import-name-error";
  // A click outside must not discard a typed name. Once true it stays true:
  // the reader's work is on the panel either way.
  const [nameTouched, setNameTouched] = useState(false);

  return (
    <DialogShell
      label={labels.title}
      // Every field states its own hint and its own refusal beside it.
      describedBy={null}
      width={640}
      height="tall"
      onClose={onClose}
      closeEnabled={!importing}
      fieldsChanged={nameTouched}
    >
      <div className="flex shrink-0 items-center justify-between gap-2.5 border-edge border-b px-3.5 py-3">
        <h2 className="font-semibold font-ui text-gray-12 text-prose">
          {labels.title}
        </h2>
      </div>

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3.5 py-3">
        <div className="flex flex-col gap-1.5">
          {/* Checked right after a pick, and once a typed path is left: a
              check per keystroke would refuse half-typed paths (#1013). */}
          <PathField
            label="Folder path"
            hint="Import copies this folder to the Working Harness. The original folder stays unchanged."
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
            disabled={importing}
          />
          <Notice trigger="user-action" notice={sourceProblem} />
        </div>

        <div className="flex flex-col gap-1.5">
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

        {advisories.length === 0 ? null : (
          <div
            role="status"
            aria-label="Convention checks"
            className="flex flex-col gap-1.5 rounded-control border border-amber-7 bg-amber-3 px-2.5 py-2.5"
          >
            <span className="font-semibold font-ui text-amber-12 text-meta">
              Skill checks found issues. You can still import the skill.
            </span>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {advisories.map((advisory) => (
                <li key={advisory} className="font-ui text-meta text-gray-12">
                  {advisory}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Notice trigger="user-action" notice={importError} />
      </div>

      <div className={DIALOG_FOOTER}>
        <Button
          type="button"
          className="shrink-0"
          variant="quiet"
          onClick={onClose}
          disabled={importing}
        >
          Close
        </Button>
        <Button
          type="button"
          className="shrink-0"
          variant="primary"
          busy={importing}
          disabled={!importEnabled(check)}
          onClick={onImport}
        >
          {importing ? labels.busy : labels.confirm}
        </Button>
      </div>
    </DialogShell>
  );
}
