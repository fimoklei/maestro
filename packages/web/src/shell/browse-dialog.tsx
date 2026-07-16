import { useState } from "react";
import { HttpError } from "../api/http";
import { Button } from "../ui/button";
import { BrowseBreadcrumbs } from "./browse-breadcrumbs";
import { useBrowseFilesystem } from "./use-browse-filesystem";

// A read-only directory picker (ADR-0009): lists the current directory's
// children and lets the user step in, up, or jump via breadcrumbs, then
// confirm the directory they are standing in. "Up" follows the parent the
// server reports (absent at the home ceiling) and breadcrumbs come from the
// server too — the client never derives a path from a string, so there is no
// separator math to get wrong (issue #146). The anatomy — header, toolbar,
// listing, footer separated by row dividers — mirrors the Control Room design
// (First run story flow, screens 02b/02c/03b).
type BrowseDialogProps = {
  onSelect: (path: string) => void;
  onClose: () => void;
  label?: string;
};

export function BrowseDialog({
  onSelect,
  onClose,
  label = "Select inventory folder",
}: BrowseDialogProps) {
  // The path being requested; "" asks the server for the home root.
  const [currentRequest, setCurrentRequest] = useState("");
  // The footer's paste-a-path field: confirming it hands the typed path to the
  // host form as-is, bypassing the listing (the host validates on submit).
  const [pastedPath, setPastedPath] = useState("");
  const browse = useBrowseFilesystem(currentRequest);
  const atCeiling =
    browse.data !== undefined && browse.data.parent === undefined;

  const error =
    browse.error instanceof HttpError
      ? browse.error.message
      : browse.error
        ? "Could not browse that directory."
        : null;

  // Confirm hands a path to the host form. A non-empty paste field wins over
  // the listing folder — the paste-a-path escape hatch bypasses the listing,
  // so the visible confirm and the field's Enter must agree on it.
  const confirm = () => {
    const typed = pastedPath.trim();
    if (typed !== "") {
      onSelect(typed);
    } else if (browse.data) {
      onSelect(browse.data.path);
    }
  };

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

        {/* toolbar — up + breadcrumbs (+ home-ceiling hint) */}
        <div className="flex items-center gap-2.5 border-line-row border-b px-3.5 py-3">
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
        </div>

        {/* listing */}
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-2.5 py-2">
          {browse.isPending ? (
            <p className="px-2.5 py-1.5 font-mono text-dim text-tag">
              Loading…
            </p>
          ) : (
            browse.data?.entries.map((entry) => (
              <button
                key={entry.path}
                type="button"
                aria-label={entry.name}
                onClick={() => setCurrentRequest(entry.path)}
                className="flex items-center gap-2.5 rounded-control px-2.5 py-[7px] text-left hover:bg-active"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-desc text-fg">
                  {entry.name}/
                </span>
                <span className="w-3.5 text-right font-mono text-data text-dim">
                  →
                </span>
              </button>
            ))
          )}
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
            disabled={!browse.data && pastedPath.trim() === ""}
            onClick={confirm}
          >
            use this folder →
          </Button>
        </div>
      </div>
    </div>
  );
}
