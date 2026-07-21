import { Chip } from "../ui/chip";
import { type BrowseDialogMode, browseModes } from "./browse-modes";
import type { BrowseEntry } from "./use-browse-filesystem";

// One row of the browse listing: a selection checkbox where registration is
// possible, the folder name, its symlink tag, its mode-aware badges, and the
// step-in affordance.
// Selecting and stepping in are deliberately two separate controls — ticking a
// repo to register it must never navigate away from the folder you are
// reading (issue #151). The badges come from the mode's own config
// (issue #156), so this row renders them without knowing either mode's rules.
// Tested through browse-dialog.test.tsx, the same pattern as the sibling
// BrowseBreadcrumbs component.
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
      className={`flex items-center gap-2.5 rounded-control border px-2.5 py-[7px] ${
        checked
          ? "border-amber-border bg-amber-bg"
          : "border-transparent hover:bg-active"
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
          <span className="w-3.5 text-right font-mono text-data text-dim">
            →
          </span>
        </span>
      </button>
    </div>
  );
}
