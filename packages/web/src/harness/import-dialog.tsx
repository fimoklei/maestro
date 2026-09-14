import { targetLabel } from "../shell/target-label";
import { Button } from "../ui/button";
import { DialogShell } from "../ui/dialog-shell";
import { Notice, type NoticeContent } from "../ui/notice";
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

// Importing one external skill folder: the folder, the directory name it lands
// under, what refuses it and what is only worth knowing. Presentational — the
// host owns the picker, the check query and the import mutation (#576).
export function ImportDialog({
  source,
  name,
  load,
  onPickSource,
  onNameChange,
  onClose,
  onImport,
  onView,
  importing,
  importError,
  imported,
}: {
  source: string | null;
  name: string;
  load: ImportCheckLoad;
  onPickSource: () => void;
  onNameChange: (name: string) => void;
  onClose: () => void;
  onImport: () => void;
  /** Leave the dialog for the row this import landed as (#846). */
  onView: (name: string) => void;
  importing: boolean;
  importError: NoticeContent | null;
  // Null until an import lands. It stays on screen after it does, so what the
  // copy left behind is readable rather than gone with the dialog (#576).
  imported: { mode: "add" | "update"; name: string; skipped: number } | null;
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

  return (
    <DialogShell
      label={labels.title}
      // Every field states its own hint and its own refusal beside it.
      describedBy={null}
      width={560}
      height="tall"
      onClose={onClose}
      closeEnabled={!importing}
    >
      <div className="flex shrink-0 items-center justify-between gap-2.5 border-line-row border-b px-3.5 py-3">
        <h2 className="font-semibold font-ui text-fg text-subtitle">
          {labels.title}
        </h2>
      </div>

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3.5 py-3">
        <div className="flex flex-col gap-1.5">
          <span className="m-label">Skill folder</span>
          <div className="flex items-center gap-2.5">
            {/* The tail names the folder; left-anchored truncation would cut
                  exactly that away (#211). */}
            <span
              title={source ?? undefined}
              className="min-w-0 flex-1 truncate font-mono text-data text-fg"
            >
              {source === null ? "Choose a skill folder" : targetLabel(source)}
            </span>
            <Button
              type="button"
              variant="quiet"
              size="sm"
              onClick={onPickSource}
            >
              {source === null ? "Pick folder" : "Change folder"}
            </Button>
          </div>
          {/* The answer to picking a folder, so it announces assertively —
                the author is looking at the button they just pressed. */}
          <Notice trigger="user-action" notice={sourceProblem} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="m-label" htmlFor="import-name">
            Name in the Harness
          </label>
          <input
            id="import-name"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            disabled={source === null || locked}
            aria-invalid={nameProblem !== null}
            aria-describedby={nameProblem === null ? undefined : nameErrorId}
            // No outline-none: it poisons --tw-outline-style and hides the
            // ring (#227).
            className="rounded-control border border-line bg-inset px-2 py-1.5 font-mono text-fg text-mono-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
          />
          {/* The directory name is the skill's identity, so it is stated
                before it is chosen, not explained after a failure. */}
          <span className="font-ui text-desc text-muted">{labels.hint}</span>
          <Notice id={nameErrorId} trigger="user-action" notice={nameProblem} />
        </div>

        {advisories.length === 0 ? null : (
          <div
            role="status"
            aria-label="Convention checks"
            className="flex flex-col gap-1.5 rounded-control border border-line-drift bg-amber-bg px-2.5 py-2.5"
          >
            <span className="font-semibold font-ui text-amber-ink text-desc">
              Convention checks — the import still runs
            </span>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {advisories.map((advisory) => (
                <li key={advisory} className="font-ui text-desc text-fg-2">
                  {advisory}
                </li>
              ))}
            </ul>
          </div>
        )}

        {imported === null ? null : (
          <>
            <Notice
              trigger="user-action"
              notice={{
                level: "success",
                label: "Skill imported",
                message: "View your imported skill in Harness.",
                detail:
                  imported.mode === "update"
                    ? "The deployed copy is not up to date until you deploy it again."
                    : undefined,
                action: {
                  label: "View in Harness",
                  onClick: () => onView(imported.name),
                },
              }}
            />
            {imported.skipped === 0 ? null : (
              <p className="m-0 font-ui text-desc text-dim">
                {imported.skipped === 1
                  ? "1 entry was skipped: .git and operating-system files."
                  : `${imported.skipped} entries were skipped: .git and operating-system files.`}
              </p>
            )}
          </>
        )}

        <Notice trigger="user-action" notice={importError} />
      </div>

      <div className="flex shrink-0 items-center gap-2.5 border-line-row border-t px-3.5 py-3">
        <span className="flex-1" />
        <Button
          type="button"
          className="shrink-0"
          variant="quiet"
          size="sm"
          onClick={onClose}
          disabled={importing}
        >
          Close
        </Button>
        <Button
          type="button"
          className="shrink-0"
          variant="primary"
          size="sm"
          disabled={!importEnabled(check) || importing || imported !== null}
          onClick={onImport}
        >
          {importing ? labels.busy : labels.confirm}
        </Button>
      </div>
    </DialogShell>
  );
}
