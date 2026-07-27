import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "./cn";
import { HOVER_TRANSITION } from "./hover-transition";

// The cockpit's per-row actions menu: a named list of actions behind one small
// trigger, so a row action reads as words instead of a guessed glyph. Built on
// Radix Dropdown Menu (ADR-0004 adopts shadcn/ui for exactly these accessible
// primitives) and restyled to our tokens, so arrow-key roving focus, typeahead,
// Escape and the aria-haspopup/aria-expanded contract come from one place.
// Presentational: the caller owns what each item does.

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
        // A menu with nothing in it would open onto an empty box, so the
        // trigger states that in the one way assistive tech already reads:
        // present, named, and inert.
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
          // One step up the surface ramp from the card it floats over, so the
          // panel separates without the shadow DESIGN.md §5 rules out.
          className="min-w-32 rounded-item border border-line-chip bg-inset py-1"
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(
                "cursor-pointer px-card-x py-1 font-mono text-desc text-fg-2 outline-none",
                "data-[highlighted]:bg-active data-[highlighted]:text-fg",
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
