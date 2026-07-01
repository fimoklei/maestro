import { useState } from "react";
import { HttpError } from "../api/http";
import { Button } from "../ui/button";
import { useBrowseFilesystem } from "./use-browse-filesystem";

// A read-only directory picker (ADR-0009): lists the current directory's
// children and lets the user step in or back up, then confirm the directory
// they are standing in as the inventory path. A navigation stack (not parent
// path math) drives "up" — the server already resolves real paths for us, so
// re-deriving a parent from a string would just risk getting it wrong on a
// path the OS-specific separators don't match.
type BrowseDialogProps = {
  onSelect: (path: string) => void;
  onClose: () => void;
};

export function BrowseDialog({ onSelect, onClose }: BrowseDialogProps) {
  const [stack, setStack] = useState<string[]>([""]);
  const currentRequest = stack[stack.length - 1] ?? "";
  const browse = useBrowseFilesystem(currentRequest);

  const error =
    browse.error instanceof HttpError
      ? browse.error.message
      : browse.error
        ? "Could not browse that directory."
        : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Browse for inventory folder"
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-6"
    >
      <div className="flex max-h-[70vh] w-full max-w-md flex-col gap-2 rounded-card border border-line bg-card p-card-x">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="quiet"
            size="sm"
            onClick={() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))}
            disabled={stack.length <= 1}
          >
            ↑ up
          </Button>
          <span className="flex-1 truncate font-mono text-dim text-tag">
            {browse.data?.path ?? "…"}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-control border border-line-row">
          {browse.isPending ? (
            <p className="p-2 text-dim text-tag">Loading…</p>
          ) : error ? (
            <p role="alert" className="p-2 text-amber-ink text-tag">
              {error}
            </p>
          ) : (
            <ul>
              {browse.data?.entries.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    onClick={() => setStack((s) => [...s, entry.path])}
                    className="w-full cursor-pointer truncate px-2 py-1.5 text-left font-mono text-fg text-mono-sm hover:bg-active"
                  >
                    {entry.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!browse.data}
            onClick={() => browse.data && onSelect(browse.data.path)}
          >
            Select this folder
          </Button>
          <Button type="button" variant="quiet" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
