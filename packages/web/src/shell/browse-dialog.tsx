import { useState } from "react";
import { Button } from "../ui/button";
import { DialogShell } from "../ui/dialog-shell";
import { HOVER_TRANSITION } from "../ui/hover-transition";
import { Notice } from "../ui/notice";
import { BrowseBreadcrumbs } from "./browse-breadcrumbs";
import { BrowseEntryRow } from "./browse-entry-row";
import { type BrowseDialogMode, browseModes } from "./browse-modes";
import { browseNotice } from "./browse-notice";
import { useBrowseNavigation } from "./use-browse-navigation";
import { useFolderFilter } from "./use-folder-filter";

// A read-only directory picker (ADR-0009), server-derived breadcrumbs (#146).
// Mode-aware (#150, browse-modes.tsx) and presentational.

type BrowseDialogProps = {
  mode: BrowseDialogMode;
  // One path: the pasted one, or the folder the listing shows.
  onSelect: (paths: string[]) => void;
  onClose: () => void;
};

export function BrowseDialog({ mode, onSelect, onClose }: BrowseDialogProps) {
  const { title, confirmLabel, writePromise } = browseModes[mode];
  const { currentRequest, setCurrentRequest, browse } =
    useBrowseNavigation(mode);
  const [pastedPath, setPastedPath] = useState("");
  // Filtered client-side — one server response shape serves both toggle
  // states (#148).
  const [showHidden, setShowHidden] = useState(false);
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
  // A non-empty paste wins over the listing folder.
  const confirmedPaths =
    typedPath !== "" ? [typedPath] : browse.data ? [browse.data.path] : [];

  const confirm = () => {
    if (confirmedPaths.length > 0) {
      onSelect(confirmedPaths);
    }
  };

  // Wired as the confirm button's accessible description (ADR-0015, #218).
  const writePromiseId = "browse-write-promise";

  return (
    <DialogShell
      label={title}
      // The listing is the dialog, and it names itself row by row.
      describedBy={null}
      width={640}
      height="compact"
      border="border-line"
      onClose={onClose}
    >
      <div className="flex shrink-0 items-center gap-2.5 border-line-row border-b px-3.5 py-3">
        <h2 className="font-semibold font-ui text-fg text-subtitle">{title}</h2>
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={`cursor-pointer font-mono text-data text-dim hover:text-fg ${HOVER_TRANSITION}`}
        >
          ✕
        </button>
      </div>

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

      <div className="flex shrink-0 flex-col gap-2 border-line-row border-t px-3.5 py-3">
        {writePromise ? (
          <p id={writePromiseId} className="font-mono text-dim text-tag">
            {writePromise}
          </p>
        ) : null}
        <div className="flex items-center gap-2.5">
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
          <Button type="button" variant="quiet" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            aria-describedby={writePromise ? writePromiseId : undefined}
            disabled={confirmedPaths.length === 0}
            onClick={confirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
