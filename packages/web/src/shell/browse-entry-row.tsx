import { Chip } from "../ui/chip";
import { HOVER_TRANSITION, REVEAL_TRANSITION } from "../ui/hover-transition";
import { type BrowseDialogMode, browseModes } from "./browse-modes";
import type { BrowseEntry } from "./use-browse-filesystem";

// Selecting and stepping in are deliberately two separate controls — ticking a
// repo to register it must never navigate away from the folder (#151).
export function BrowseEntryRow({
  mode,
  entry,
  registeredPaths,
  inventoryPath,
  checked,
  onToggle,
  onEnter,
}: {
  mode: BrowseDialogMode;
  entry: BrowseEntry;
  registeredPaths?: ReadonlySet<string>;
  inventoryPath?: string;
  checked: boolean;
  onToggle: () => void;
  onEnter: () => void;
}) {
  const isRegistered = registeredPaths?.has(entry.path) ?? false;
  const unavailableReason =
    mode === "register" && entry.path === inventoryPath
      ? "central inventory"
      : mode === "register" && !entry.facts.isGitRepo
        ? "not a git repo"
        : undefined;
  const disabled = isRegistered || unavailableReason !== undefined;

  return (
    <div
      className={`group flex items-center gap-2.5 rounded-control border px-2.5 py-[7px] ${HOVER_TRANSITION} ${
        checked
          ? "border-amber-border bg-amber-bg"
          : "border-transparent hover:bg-inset"
      }`}
    >
      {mode === "register" ? (
        <input
          type="checkbox"
          aria-label={`Select ${entry.name}${
            unavailableReason ? `: ${unavailableReason}` : ""
          }`}
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          className="size-4 shrink-0 accent-amber-ink enabled:cursor-pointer disabled:cursor-not-allowed"
        />
      ) : null}
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
              ↳ symlink
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {browseModes[mode].badges({ entry, isRegistered })}
          {unavailableReason ? <Chip>{unavailableReason}</Chip> : null}
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
