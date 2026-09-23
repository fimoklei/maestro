import { HOVER_TRANSITION, REVEAL_TRANSITION } from "../ui/hover-transition";
import { type BrowseDialogMode, browseModes } from "./browse-modes";
import type { BrowseEntry } from "./use-browse-filesystem";

// One row of the listing: stepping into a folder is its only control.
export function BrowseEntryRow({
  mode,
  entry,
  onEnter,
}: {
  mode: BrowseDialogMode;
  entry: BrowseEntry;
  onEnter: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-2.5 rounded-control border border-transparent px-2.5 py-[7px] hover:bg-inset ${HOVER_TRANSITION}`}
    >
      <button
        type="button"
        aria-label={entry.name}
        onClick={onEnter}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span
            className={`truncate font-mono text-desc ${
              entry.isHidden ? "text-dim" : "text-fg"
            }`}
          >
            {entry.name}/
          </span>
          {entry.isSymlink ? (
            <span className="shrink-0 font-mono text-dim text-tag">
              ↳ Symlink
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {browseModes[mode].badges({ entry })}
          {/* Reserved, not removed: the row keeps its width, so revealing the
              glyph never shifts the badges beside it. */}
          <span
            aria-hidden="true"
            className={`w-3.5 text-right font-mono text-data text-dim opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 ${REVEAL_TRANSITION}`}
          >
            →
          </span>
        </span>
      </button>
    </div>
  );
}
