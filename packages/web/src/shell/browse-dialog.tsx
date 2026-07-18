import { useState } from "react";
import { HttpError } from "../api/http";
import { Button } from "../ui/button";
import { BrowseBreadcrumbs } from "./browse-breadcrumbs";
import { BrowseEntryRow } from "./browse-entry-row";
import { useBrowseNavigation } from "./use-browse-navigation";
import { useFolderFilter } from "./use-folder-filter";

// A read-only directory picker (ADR-0009): lists the current directory's
// children and lets the user step in, up, or jump via breadcrumbs, then
// confirm the directory they are standing in. "Up" follows the parent the
// server reports (absent at the home ceiling) and breadcrumbs come from the
// server too — the client never derives a path from a string, so there is no
// separator math to get wrong (issue #146). The anatomy — header, toolbar,
// listing, footer separated by row dividers — mirrors the Control Room design
// (First run story flow, screens 02b/02c/03b).
//
// The dialog is mode-aware (issue #150): the server only reports per-entry
// facts (is a git repo, has a skills/ subdir) — never a badge decision. This
// component decides what to badge per mode: register mode badges `git` repos
// and already-registered ones; connect mode badges folders that look like an
// inventory. The inventory badge is a hint, not a guarantee — connect
// validation remains the authority.
//
// Hidden entries (dot-prefixed) are filtered out by default; the toolbar's
// show-hidden toggle and the "N hidden items not shown · show" hint both flip
// the same local `showHidden` flag — one response shape from the server
// serves both toggle states, filtering happens entirely client-side. A
// symlinked entry the server resolved inside the home ceiling renders a
// "↳ symlink" tag; the server already dropped anything escaping the ceiling,
// so the client never resolves or judges a symlink itself (issue #148).
//
// Register mode is multi-select (issue #151): every git-repo row carries a
// checkbox, the selection is one set per dialog session that survives
// navigating between folders, and confirm hands the host every checked path
// at once. The dialog stays presentational — it returns paths and never
// registers anything itself; the host owns the registration loop and its
// per-repo outcomes.
export type BrowseDialogMode = "register" | "connect";

const dialogTitle: Record<BrowseDialogMode, string> = {
  connect: "Select inventory folder",
  register: "Select repos to register",
};

type BrowseDialogProps = {
  mode: BrowseDialogMode;
  // Always a list, in both modes: connect confirms exactly one path, register
  // confirms every checked one. One shape keeps the host wiring uniform.
  onSelect: (paths: string[]) => void;
  onClose: () => void;
  // Register mode only: entry paths already in the registry, for the
  // client-side "● registered" join (issue #150) — the server stays
  // registry-agnostic.
  registeredPaths?: ReadonlySet<string>;
};

export function BrowseDialog({
  mode,
  onSelect,
  onClose,
  registeredPaths,
}: BrowseDialogProps) {
  const label = dialogTitle[mode];
  // Owns the requested path, its query, and the last-used-folder memory
  // (issue #149) — connect and register never share a memory.
  const { currentRequest, setCurrentRequest, browse } =
    useBrowseNavigation(mode);
  // The footer's paste-a-path field: confirming it hands the typed path to the
  // host form as-is, bypassing the listing (the host validates on submit).
  const [pastedPath, setPastedPath] = useState("");
  // Hidden entries are filtered client-side by default; the server sends one
  // response shape (every entry, each carrying isHidden) and this toggle
  // decides what the listing shows — no second request (issue #148).
  const [showHidden, setShowHidden] = useState(false);
  // Register mode's selection: paths checked anywhere in this dialog session,
  // in the order they were ticked. An array (not a Set) because confirm hands
  // the host a list and the order it reads in is the order the user built.
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const atCeiling =
    browse.data !== undefined && browse.data.parent === undefined;
  const allEntries = browse.data?.entries ?? [];
  const hiddenCount = allEntries.filter((entry) => entry.isHidden).length;
  const hiddenFilteredEntries = showHidden
    ? allEntries
    : allEntries.filter((entry) => !entry.isHidden);
  // Narrows the listing client-side as the user types (issue #149), on top
  // of the hidden-entry filter above — typing still searches only what the
  // hidden toggle currently allows through.
  const { filter, setFilter, visibleEntries } = useFolderFilter(
    currentRequest,
    hiddenFilteredEntries,
  );

  const error =
    browse.error instanceof HttpError
      ? browse.error.message
      : browse.error
        ? "Could not browse that directory."
        : null;

  const typedPath = pastedPath.trim();
  // What confirm would hand the host right now. Connect confirms one path: a
  // non-empty paste field wins over the listing folder — the escape hatch
  // bypasses the listing, so the visible confirm and the field's Enter must
  // agree on it. Register confirms every checked repo, plus a pasted path as
  // one more selection, so pasting keeps working where checkboxes can't reach.
  const confirmedPaths =
    mode === "register"
      ? // Deduplicated: pasting a path that is already ticked must not
        // register it twice, nor inflate the count.
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

  const toggleSelected = (path: string) =>
    setSelectedPaths((current) =>
      current.includes(path)
        ? current.filter((selected) => selected !== path)
        : [...current, path],
    );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-6"
    >
      <div className="flex max-h-[70vh] w-full max-w-[620px] flex-col overflow-hidden rounded-card border border-line bg-chrome">
        {/* header — mode title + close */}
        <div className="flex items-center gap-2.5 border-line-row border-b px-3.5 py-3">
          <h2 className="font-semibold font-ui text-fg text-subtitle">
            {label}
          </h2>
          <span className="flex-1" />
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="cursor-pointer font-mono text-data text-dim hover:text-fg"
          >
            ✕
          </button>
        </div>

        {/* toolbar — up + breadcrumbs (+ home-ceiling hint), then the filter */}
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
              className="shrink-0 rounded-control border px-2.5 py-[5px] font-mono text-mono-sm enabled:cursor-pointer enabled:border-line enabled:bg-inset enabled:text-fg-2 disabled:cursor-not-allowed disabled:border-line-chip disabled:text-dim"
            >
              ↑ up
            </button>
            {browse.data ? (
              <BrowseBreadcrumbs
                crumbs={browse.data.breadcrumbs}
                onNavigate={setCurrentRequest}
              />
            ) : (
              <span className="font-mono text-dim text-mono-sm">…</span>
            )}
            {atCeiling ? (
              <span className="whitespace-nowrap font-mono text-dim text-tag">
                · home ceiling
              </span>
            ) : null}
            <span className="flex-1" />
            <button
              type="button"
              aria-pressed={showHidden}
              onClick={() => setShowHidden((current) => !current)}
              className={`shrink-0 whitespace-nowrap rounded-control border px-2.5 py-[5px] font-mono text-mono-sm ${
                showHidden
                  ? "border-amber-border bg-amber-bg text-amber-ink"
                  : "border-line-chip text-dim"
              }`}
            >
              {showHidden ? "◑" : "◐"} hidden
            </button>
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
              className="min-w-0 flex-1 bg-transparent font-mono text-fg text-mono-sm placeholder:text-dim focus:outline-none"
            />
          </div>
        </div>

        {/* listing */}
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-2.5 py-2">
          {browse.isPending ? (
            <p className="px-2.5 py-1.5 font-mono text-dim text-tag">
              Loading…
            </p>
          ) : (
            visibleEntries.map((entry) => (
              <BrowseEntryRow
                key={entry.path}
                mode={mode}
                entry={entry}
                registeredPaths={registeredPaths}
                checked={selectedPaths.includes(entry.path)}
                onToggle={() => toggleSelected(entry.path)}
                onEnter={() => setCurrentRequest(entry.path)}
              />
            ))
          )}
          {!showHidden && !browse.isPending && hiddenCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowHidden(true)}
              className="flex items-center gap-2 rounded-control px-2.5 py-2 text-left"
            >
              <span className="font-mono text-dim text-tag">
                {hiddenCount} hidden item{hiddenCount === 1 ? "" : "s"} not
                shown
              </span>
              <span className="font-mono text-amber-ink text-tag">· show</span>
            </button>
          ) : null}
        </div>

        {/* in-dialog error banner — never an empty listing (story 22) */}
        {error ? (
          <div
            role="alert"
            className="mx-3.5 mb-3 flex items-center gap-2 rounded-control border border-amber-border bg-amber-bg px-2.5 py-2.5"
          >
            <span className="text-amber-ink text-data">▲</span>
            <span className="font-mono text-fg-2 text-mono-sm">{error}</span>
          </div>
        ) : null}

        {/* footer — paste-a-path alongside cancel/confirm */}
        <div className="flex items-center gap-2.5 border-line-row border-t px-3.5 py-3">
          <form
            className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-line bg-inset px-2.5 py-[7px]"
            onSubmit={(event) => {
              event.preventDefault();
              confirm();
            }}
          >
            <label htmlFor="browse-paste-path" className="m-label shrink-0">
              or paste
            </label>
            <input
              id="browse-paste-path"
              type="text"
              value={pastedPath}
              onChange={(event) => setPastedPath(event.target.value)}
              placeholder="/absolute/path…"
              className="min-w-0 flex-1 bg-transparent font-mono text-fg text-mono-sm placeholder:text-dim focus:outline-none"
            />
          </form>
          <Button type="button" variant="quiet" size="sm" onClick={onClose}>
            cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={confirmedPaths.length === 0}
            onClick={confirm}
          >
            {mode === "register"
              ? `register ${confirmedPaths.length} selected →`
              : "use this folder →"}
          </Button>
        </div>
      </div>
    </div>
  );
}
