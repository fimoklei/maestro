import { useModalDialog } from "../shell/use-modal-dialog";
import { Button } from "../ui/button";
import { FailureNote } from "../ui/failure-note";
import {
  advisoryTexts,
  importEnabled,
  nameBlockerText,
  sourceBlockerText,
} from "./import-view-model";
import type { ImportCheck } from "./use-harness";

// The check travels with its loading and error states so the modal stays
// mounted across them — a focus trap that unmounts loses the author's place.
export type ImportCheckLoad =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
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
  importing: boolean;
  importError: string | null;
  // Null until an import lands. It stays on screen after it does, so what the
  // copy left behind is readable rather than gone with the dialog (#576).
  imported: { name: string; skipped: number } | null;
}) {
  const { panelRef, requestClose } = useModalDialog({
    onClose,
    closeEnabled: !importing,
  });
  const check = load.kind === "ready" ? load.check : undefined;
  const sourceProblem =
    load.kind === "error"
      ? load.message
      : sourceBlockerText(check?.sourceBlocker ?? null);
  const nameProblem = nameBlockerText(check?.nameBlocker ?? null);
  const advisories = advisoryTexts(check?.advisories ?? []);
  const nameErrorId = "import-name-error";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-6">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={requestClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Import a skill"
        tabIndex={-1}
        className="relative flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-card border border-line-row bg-chrome outline-none"
      >
        <div className="flex items-center justify-between gap-2.5 border-line-row border-b px-3.5 py-3">
          <h2 className="font-semibold font-ui text-fg text-subtitle">
            Import a skill
          </h2>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-3.5 py-3">
          <div className="flex flex-col gap-1.5">
            <span className="m-label">Skill folder</span>
            <div className="flex items-center gap-2.5">
              <span className="min-w-0 flex-1 truncate font-mono text-data text-fg">
                {source ?? "No folder picked yet."}
              </span>
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={onPickSource}
              >
                {source === null ? "pick folder" : "change"}
              </Button>
            </div>
            {sourceProblem === null ? null : (
              <p role="alert" className="m-0 text-amber-ink text-tag">
                {sourceProblem}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="m-label" htmlFor="import-name">
              Name in the Harness
            </label>
            <input
              id="import-name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              disabled={source === null}
              aria-invalid={nameProblem !== null}
              aria-describedby={nameProblem === null ? undefined : nameErrorId}
              // No outline-none: it poisons --tw-outline-style and hides the
              // ring (#227).
              className="rounded-control border border-line bg-inset px-2 py-1.5 font-mono text-fg text-mono-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
            />
            {/* The directory name is the skill's identity, so it is stated
                before it is chosen, not explained after a failure. */}
            <span className="font-ui text-desc text-muted">
              This becomes the folder name, and the SKILL.md name is rewritten
              to match.
            </span>
            {nameProblem === null ? null : (
              <p
                id={nameErrorId}
                role="alert"
                className="m-0 text-amber-ink text-tag"
              >
                {nameProblem}
              </p>
            )}
          </div>

          {advisories.length === 0 ? null : (
            <div
              role="status"
              aria-label="Convention checks"
              className="flex flex-col gap-1.5 rounded-control border border-line-drift bg-amber-bg px-2.5 py-2.5"
            >
              <span className="font-semibold font-ui text-amber-ink text-desc">
                Convention checks — advisory, does not block import
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
            <p role="status" className="m-0 font-ui text-desc text-fg-2">
              <span className="font-mono text-fg">{imported.name}</span> landed
              in the Harness as a pending promotion.
              {imported.skipped === 0
                ? null
                : imported.skipped === 1
                  ? " 1 .git entry was skipped."
                  : ` ${imported.skipped} .git entries were skipped.`}
            </p>
          )}

          {importError === null ? null : (
            <FailureNote label="nothing imported" message={importError} />
          )}
        </div>

        <div className="flex items-center gap-2.5 border-line-row border-t px-3.5 py-3">
          <span className="flex-1" />
          <Button
            type="button"
            className="shrink-0"
            variant="quiet"
            size="sm"
            onClick={onClose}
            disabled={importing}
          >
            close
          </Button>
          <Button
            type="button"
            className="shrink-0"
            variant="primary"
            size="sm"
            disabled={!importEnabled(check) || importing || imported !== null}
            onClick={onImport}
          >
            {importing ? "importing…" : "import"}
          </Button>
        </div>
      </div>
    </div>
  );
}
