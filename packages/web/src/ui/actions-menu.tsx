import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "./cn";
import { HOVER_TRANSITION } from "./hover-transition";

// Per-row actions menu on Radix Dropdown Menu (ADR-0004), restyled to tokens.
// Presentational — the caller owns what each item does.

export interface ActionsMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

export interface ActionsMenuProps {
  /** Accessible name for the trigger, e.g. "Actions for tdd". */
  label: string;
  items: readonly ActionsMenuItem[];
}

export function ActionsMenu({ label, items }: ActionsMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={label}
        disabled={items.length === 0}
        className={cn(
          "cursor-pointer rounded-control border border-transparent bg-transparent px-1.5 py-0.5 font-mono text-muted text-tag leading-none",
          HOVER_TRANSITION,
          "enabled:hover:border-line-chip enabled:hover:bg-inset enabled:hover:text-fg-2",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber",
          "disabled:cursor-not-allowed disabled:text-dim",
        )}
      >
        ⋯
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          // bg-card, not bg-inset: leaves the inset hover state below free to
          // read as hover (#388).
          className="min-w-32 rounded-item border border-line-chip bg-card py-1"
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(
                "cursor-pointer px-card-x py-1 font-mono text-desc text-fg-2 outline-none",
                HOVER_TRANSITION,
                // data-[highlighted]: Radix's combined hover + roving-focus
                // state. bg-inset, not bg-active — a menu item is never a
                // standing choice (#388).
                "data-[highlighted]:bg-inset data-[highlighted]:text-fg",
                "data-[disabled]:cursor-not-allowed data-[disabled]:text-dim",
              )}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
