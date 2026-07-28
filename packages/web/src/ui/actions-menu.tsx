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
          // The panel sits on the card surface and separates through its 1px
          // chip border, which is how DESIGN.md §5 draws structure — no shadow,
          // and no fill step either. Sitting a step lower than the item hover
          // below is what leaves the inset surface free to read as hover; a
          // panel already on inset would swallow it (#388).
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
                // Radix sets data-[highlighted] on pointer hover as well as
                // keyboard roving focus, so this is the hover state and takes
                // the inset surface. The active surface stays reserved for a
                // standing choice, which a menu item never is (#388).
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
