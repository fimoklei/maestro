import { useState } from "react";
import type { RegistrationOutcome } from "../registry/use-register-repos";
import { Button } from "../ui/button";
import { DialogShell } from "../ui/dialog-shell";
import { HOVER_TRANSITION } from "../ui/hover-transition";
import { Notice } from "../ui/notice";
import { BrowseBreadcrumbs } from "./browse-breadcrumbs";
import { BrowseEntryRow } from "./browse-entry-row";
import { type BrowseDialogMode, browseModes } from "./browse-modes";
import { browseNotice } from "./browse-notice";
import { BrowseRunReport } from "./browse-run-report";
import { useBrowseNavigation } from "./use-browse-navigation";
import { useFolderFilter } from "./use-folder-filter";

// A read-only directory picker (ADR-0009), server-derived breadcrumbs (#146).
// Mode-aware (#150, browse-modes.tsx): register is multi-select and
// presentational; confirming switches to reporting instead of closing (#175).

type BrowseDialogProps = {
  mode: BrowseDialogMode;
  // Always a list: connect confirms one path, register confirms every checked one.
  onSelect: (paths: string[]) => void;
  onClose: () => void;
  // Register mode only: client-side "● registered" join (#150).
  registeredPaths?: ReadonlySet<string>;
  // Register mode only: central inventory's row is visibly unavailable
  // before the server enforces the same rule for pasted paths.
  inventoryPath?: string;
  outcomes?: readonly RegistrationOutcome[];
  // The run's whole selection, so the report lists the repos still queued.
  runPaths?: readonly string[];
  isRegistering?: boolean;
};

export function BrowseDialog({
  mode,
  onSelect,
  onClose,
  registeredPaths,
  inventoryPath,
  outcomes = [],
  runPaths,
  isRegistering = false,
}: BrowseDialogProps) {
  const { title, confirmLabel, writePromise } = browseModes[mode];
  const { currentRequest, setCurrentRequest, browse } =
    useBrowseNavigation(mode);
  const [pastedPath, setPastedPath] = useState("");
  // Filtered client-side — one server response shape serves both toggle
  // states (#148).
  const [showHidden, setShowHidden] = useState(false);
  // Array, not a Set: confirm hands the host the order the user ticked in.
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const atCeiling =
    browse.data !== undefined && browse.data.parent === undefined;
  const allEntries = browse.data?.entries ?? [];
  const hiddenCount = allEntries.filter((entry) => entry.isHidden).length;
  const hiddenFilteredEntries = showHidden
    ? allEntries
    : allEntries.filter((entry) => !entry.isHidden);
  const { filter, setFilter, visibleEntries } = useFolderFilter(
    currentRequest,
    hiddenFilteredEntries,
  );

  const notice = browseNotice(browse.error);

  const typedPath = pastedPath.trim();
  // Connect: a non-empty paste wins over the listing folder. Register: every
  // checked repo plus a pasted path as one more selection.
  const confirmedPaths =
    mode === "register"
      ? // Deduplicated: an already-ticked paste must not double-count.
        [
          ...new Set([
            ...selectedPaths,
            ...(typedPath === "" ? [] : [typedPath]),
          ]),
        ]
      : typedPath !== ""
        ? [typedPath]
        : browse.data
          ? [browse.data.path]
          : [];

  const confirm = () => {
    if (confirmedPaths.length > 0) {
      onSelect(confirmedPaths);
    }
  };

  const reporting = isRegistering || outcomes.length > 0;
  // The dialog's accessible name — "Select repos to register" describes
  // nothing once the listing is gone.
  const heading = reporting ? "Registration result" : title;

  // Wired as the confirm button's accessible description (ADR-0015, #218).
  const writePromiseId = "browse-write-promise";
  const shownWritePromise = reporting ? null : writePromise;

  const toggleSelected = (path: string) =>
    setSelectedPaths((current) =>
      current.includes(path)
        ? current.filter((selected) => selected !== path)
        : [...current, path],
    );

  return (
    // Blocked while a registration is in flight — the run's failures are
    // readable nowhere else (#175).
    <DialogShell
      label={heading}
      // The listing is the dialog, and it names itself row by row.
      describedBy={null}
      width={640}
      height="compact"
      border="border-line"
      onClose={onClose}
      closeEnabled={!isRegistering}
    >
      <div className="flex shrink-0 items-center gap-2.5 border-line-row border-b px-3.5 py-3">
        <h2 className="font-semibold font-ui text-fg text-subtitle">
          {heading}
        </h2>
        <span className="flex-1" />
        {!reporting ? (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`cursor-pointer font-mono text-data text-dim hover:text-fg ${HOVER_TRANSITION}`}
          >
            ✕
          </button>
        ) : null}
      </div>

      {reporting ? (
        <BrowseRunReport
          outcomes={outcomes}
          runPaths={runPaths}
          isRegistering={isRegistering}
        />
      ) : (
        <>
          <div className="flex flex-col gap-2.5 border-line-row border-b px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const parent = browse.data?.parent;
                  if (parent !== undefined) {
                    setCurrentRequest(parent);
                  }
                }}
                disabled={browse.data?.parent === undefined}
                aria-describedby={atCeiling ? "browse-up-reason" : undefined}
                className={`shrink-0 rounded-control border px-2.5 py-[5px] font-mono text-mono-sm ${HOVER_TRANSITION} enabled:cursor-pointer enabled:border-line enabled:bg-inset enabled:text-fg-2 enabled:hover:border-line-chip enabled:hover:text-fg disabled:cursor-not-allowed disabled:border-line-chip disabled:text-dim`}
              >
                ↑ Up
              </button>
              {atCeiling ? (
                <span
                  id="browse-up-reason"
                  className="whitespace-nowrap font-mono text-dim text-tag"
                >
                  Already at home
                </span>
              ) : null}
              {browse.data ? (
                <BrowseBreadcrumbs
                  crumbs={browse.data.breadcrumbs}
                  onNavigate={setCurrentRequest}
                />
              ) : (
                <span className="font-mono text-dim text-mono-sm">
                  Loading the path…
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 rounded-control border border-line bg-inset px-2.5 py-[7px]">
              <label htmlFor="browse-filter" className="sr-only">
                Filter this folder
              </label>
              <span className="font-mono text-dim text-mono-sm">⌕</span>
              <input
                id="browse-filter"
                type="text"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="filter this folder…"
                className="min-w-0 flex-1 bg-transparent font-mono text-fg text-mono-sm placeholder:text-dim"
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-2.5 py-2">
            {browse.isPending ? (
              <p className="px-2.5 py-1.5 font-mono text-dim text-tag">
                Loading this folder…
              </p>
            ) : (
              visibleEntries.map((entry) => (
                <BrowseEntryRow
                  key={entry.path}
                  mode={mode}
                  entry={entry}
                  registeredPaths={registeredPaths}
                  inventoryPath={inventoryPath}
                  checked={selectedPaths.includes(entry.path)}
                  onToggle={() => toggleSelected(entry.path)}
                  onEnter={() => setCurrentRequest(entry.path)}
                />
              ))
            )}
            {/* The only hidden-items control: it states the count, offers
                  the way back, and leaves when the folder hides nothing. */}
            {!browse.isPending && hiddenCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowHidden((current) => !current)}
                className={`flex cursor-pointer items-center gap-2 rounded-control px-2.5 py-2 text-left hover:bg-inset ${HOVER_TRANSITION}`}
              >
                <span className="font-mono text-dim text-tag">
                  {hiddenCount} hidden item{hiddenCount === 1 ? "" : "s"}{" "}
                  {showHidden ? "shown" : "not shown"}
                </span>
                <span className="font-mono text-amber-ink text-tag">
                  · {showHidden ? "Hide hidden items" : "Show hidden items"}
                </span>
              </button>
            ) : null}
          </div>

          {/* In-dialog error banner, never an empty listing (#145). */}
          {/* The wrapper stays mounted with the region inside it; only its
                spacing is conditional, so an empty region costs no gap. */}
          <div className={notice === null ? undefined : "mx-3.5 mb-3"}>
            <Notice trigger="user-action" notice={notice} />
          </div>
        </>
      )}

      <div className="flex shrink-0 flex-col gap-2 border-line-row border-t px-3.5 py-3">
        {shownWritePromise ? (
          <p id={writePromiseId} className="font-mono text-dim text-tag">
            {shownWritePromise}
          </p>
        ) : null}
        <div className="flex items-center gap-2.5">
          {reporting ? (
            <span className="flex-1" />
          ) : (
            <form
              className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-line bg-inset px-2.5 py-[7px]"
              onSubmit={(event) => {
                event.preventDefault();
                confirm();
              }}
            >
              <label htmlFor="browse-paste-path" className="m-label shrink-0">
                Paste a path
              </label>
              <input
                id="browse-paste-path"
                type="text"
                value={pastedPath}
                onChange={(event) => setPastedPath(event.target.value)}
                placeholder="/absolute/path…"
                className="min-w-0 flex-1 bg-transparent font-mono text-fg text-mono-sm placeholder:text-dim"
              />
            </form>
          )}
          {!reporting ? (
            <Button type="button" variant="quiet" size="sm" onClick={onClose}>
              Cancel
            </Button>
          ) : null}
          <Button
            type="button"
            variant="primary"
            size="sm"
            aria-describedby={shownWritePromise ? writePromiseId : undefined}
            disabled={reporting ? isRegistering : confirmedPaths.length === 0}
            onClick={reporting ? onClose : confirm}
          >
            {reporting ? "Close" : confirmLabel(confirmedPaths.length)}
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
