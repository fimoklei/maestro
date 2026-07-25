import { useState } from "react";
import { HttpError } from "../api/http";
import type { RegistrationOutcome } from "../registry/use-register-repos";
import { Button } from "../ui/button";
import { HOVER_TRANSITION } from "../ui/hover-transition";
import { BrowseBreadcrumbs } from "./browse-breadcrumbs";
import { BrowseEntryRow } from "./browse-entry-row";
import { type BrowseDialogMode, browseModes } from "./browse-modes";
import { BrowseRunReport } from "./browse-run-report";
import { useBrowseNavigation } from "./use-browse-navigation";
import { useFolderFilter } from "./use-folder-filter";
import { useModalDialog } from "./use-modal-dialog";

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
// facts (is a git repo, has a skills/ subdir) — never a badge decision; the
// client decides. Everything that differs per mode — the title, the confirm
// label, the row badges — lives in one config in `browse-modes.tsx`, so a
// third mode is one entry there rather than a hunt through this file
// (issue #156).
//
// Hidden entries (dot-prefixed) are filtered out by default; the toolbar's
// show-hidden toggle and the "N hidden items not shown · show" hint both flip
// the same local `showHidden` flag — one response shape from the server
// serves both toggle states, filtering happens entirely client-side. A
// symlinked entry the server resolved inside the home ceiling renders a
// "↳ symlink" tag; the server already dropped anything escaping the ceiling,
// so the client never resolves or judges a symlink itself (issue #148).
//
// Register mode is multi-select (issue #151): every folder row makes its
// registration state visible, with a disabled checkbox and reason where it
// cannot be registered. The selection is one set per dialog session that
// survives navigating between folders, and confirm hands the host every
// checked path at once. The dialog stays presentational — it returns paths and
// never registers anything itself; the host owns the registration loop and its
// per-repo outcomes.
//
// Confirming does not close it (issue #175). Once the host hands back a run,
// the dialog switches from browsing to reporting: the toolbar and listing give
// way to one line per repo, and the footer's confirm becomes "close". The host
// decides whether there is a run at all, so connect — which never registers
// anything — keeps closing on confirm without a mode entry of its own.

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
  // Register mode only: the connected central inventory is not a consuming
  // repo, so its row is visibly unavailable before the server enforces the
  // same rule for pasted paths.
  inventoryPath?: string;
  // The host's registration run: what it has finished so far, and whether it
  // is still going. Either one being live flips the dialog into reporting, so
  // the report is on screen before the first repo lands.
  outcomes?: readonly RegistrationOutcome[];
  isRegistering?: boolean;
};

export function BrowseDialog({
  mode,
  onSelect,
  onClose,
  registeredPaths,
  inventoryPath,
  outcomes = [],
  isRegistering = false,
}: BrowseDialogProps) {
  const { title, confirmLabel, writePromise } = browseModes[mode];
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

  // A run claims the dialog the moment the host starts one and keeps it until
  // the user closes the report.
  const reporting = isRegistering || outcomes.length > 0;
  // Once the listing is gone, "Select repos to register" describes nothing on
  // screen — and it is the dialog's accessible name, so it is what a screen
  // reader announces for a surface that has become a report.
  const heading = reporting ? "Registration result" : title;

  // Registering is the moment Maestro is handed a write target, so the mode's
  // promise about what it writes sits on that action itself (ADR-0015, issue
  // #218) — wired as the confirm button's accessible description, not
  // free-floating text. A run already under way has no such action left.
  const writePromiseId = "browse-write-promise";
  const shownWritePromise = reporting ? null : writePromise;

  const toggleSelected = (path: string) =>
    setSelectedPaths((current) =>
      current.includes(path)
        ? current.filter((selected) => selected !== path)
        : [...current, path],
    );

  // Closing is blocked while a registration is in flight — the run's failures
  // are readable nowhere else (issue #175) — so Escape and the backdrop honour
  // the same guard as the disabled ✕.
  const { panelRef, requestClose } = useModalDialog({
    onClose,
    closeEnabled: !isRegistering,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-6">
      {/* A real button, hidden from the a11y tree and the tab order, carries the
          backdrop dismiss: clicking outside the panel closes it, mirroring
          Escape, without making a static div interactive. */}
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
        aria-label={heading}
        tabIndex={-1}
        className="relative flex max-h-[70vh] w-full max-w-[620px] flex-col overflow-hidden rounded-card border border-line bg-chrome outline-none"
      >
        <div className="flex items-center gap-2.5 border-line-row border-b px-3.5 py-3">
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
          <BrowseRunReport outcomes={outcomes} isRegistering={isRegistering} />
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
                  // Already sits on the inset surface, so it takes the border
                  // half of the one-step hover rule (DESIGN.md §5).
                  className={`shrink-0 rounded-control border px-2.5 py-[5px] font-mono text-mono-sm ${HOVER_TRANSITION} enabled:cursor-pointer enabled:border-line enabled:bg-inset enabled:text-fg-2 enabled:hover:border-line-chip enabled:hover:text-fg disabled:cursor-not-allowed disabled:border-line-chip disabled:text-dim`}
                >
                  ↑ up
                </button>
                {atCeiling ? (
                  <span
                    id="browse-up-reason"
                    className="whitespace-nowrap font-mono text-dim text-tag"
                  >
                    already at home
                  </span>
                ) : null}
                {browse.data ? (
                  <BrowseBreadcrumbs
                    crumbs={browse.data.breadcrumbs}
                    onNavigate={setCurrentRequest}
                  />
                ) : (
                  <span className="font-mono text-dim text-mono-sm">…</span>
                )}
                <span className="flex-1" />
                <button
                  type="button"
                  aria-pressed={showHidden}
                  onClick={() => setShowHidden((current) => !current)}
                  className={`shrink-0 cursor-pointer whitespace-nowrap rounded-control border px-2.5 py-[5px] font-mono text-mono-sm ${HOVER_TRANSITION} ${
                    showHidden
                      ? "border-amber-border bg-amber-bg text-amber-ink"
                      : "border-line-chip text-dim hover:bg-inset hover:text-fg-2"
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
                  className="min-w-0 flex-1 bg-transparent font-mono text-fg text-mono-sm placeholder:text-dim"
                />
              </div>
            </div>

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
                    inventoryPath={inventoryPath}
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
                  className={`flex cursor-pointer items-center gap-2 rounded-control px-2.5 py-2 text-left hover:bg-inset ${HOVER_TRANSITION}`}
                >
                  <span className="font-mono text-dim text-tag">
                    {hiddenCount} hidden item{hiddenCount === 1 ? "" : "s"} not
                    shown
                  </span>
                  <span className="font-mono text-amber-ink text-tag">
                    · show
                  </span>
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
                <span className="font-mono text-fg-2 text-mono-sm">
                  {error}
                </span>
              </div>
            ) : null}
          </>
        )}

        <div className="flex flex-col gap-2 border-line-row border-t px-3.5 py-3">
          {shownWritePromise ? (
            <p id={writePromiseId} className="font-mono text-dim text-tag">
              {shownWritePromise}
            </p>
          ) : null}
          <div className="flex items-center gap-2.5">
            {reporting ? (
              // Nothing left to paste into: confirm now only dismisses the run.
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
                  or paste
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
                cancel
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
              {reporting ? "close" : confirmLabel(confirmedPaths.length)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
