import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Fragment, type ReactNode, useRef } from "react";
import { cn } from "./cn";
import { HOVER_TRANSITION } from "./hover-transition";

// Per-row actions menu on Radix Dropdown Menu (ADR-0004), restyled to tokens.
// Presentational — the caller owns what each item does.

// An item either runs something here or leaves for somewhere else. A link is a
// real anchor, so the browser's own open-in-new-tab and focus behaviour apply.
interface ActionsMenuItem {
  label: string;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
  /** Drops or deletes something: red, moved last, alone behind a divider
   * (#994, #1009). */
  danger?: boolean;
}

// Danger last, everything else in the caller's own order — reordering is the
// only rule that changes an item's position (#1009).
const orderedItems = (
  items: readonly ActionsMenuItem[],
): readonly ActionsMenuItem[] => [
  ...items.filter((item) => !item.danger),
  ...items.filter((item) => item.danger),
];

export interface ActionsMenuProps {
  /** Accessible name for the trigger, e.g. "Actions for tdd". */
  label: string;
  items: readonly ActionsMenuItem[];
  /** A trigger of the caller's own, in place of the ⋯ glyph. */
  trigger?: ReactNode;
  /** A line above the items naming what the menu acts on. */
  heading?: string;
  /** False where every item moves focus on; Escape still returns it. */
  returnFocus?: boolean;
}

export function ActionsMenu({
  label,
  items,
  trigger,
  heading,
  returnFocus = true,
}: ActionsMenuProps) {
  // Run once the menu has closed: an open menu traps focus, so an item that
  // moves focus elsewhere would lose it.
  const pending = useRef<(() => void) | null>(null);
  return (
    <DropdownMenu.Root>
      {trigger ? (
        <DropdownMenu.Trigger asChild aria-label={label}>
          {trigger}
        </DropdownMenu.Trigger>
      ) : (
        <DropdownMenu.Trigger
          aria-label={label}
          disabled={items.length === 0}
          className={cn(
            // 24×24 is the floor a pointer target may not go under
            // (WCAG 2.2 SC 2.5.8); the glyph is smaller than its target.
            "inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-control border border-transparent bg-transparent font-mono text-muted text-tag leading-none",
            HOVER_TRANSITION,
            "enabled:hover:border-line-chip enabled:hover:bg-inset enabled:hover:text-fg-2",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber",
            "disabled:cursor-not-allowed disabled:text-dim",
          )}
        >
          ⋯
        </DropdownMenu.Trigger>
      )}
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          onCloseAutoFocus={(event) => {
            const run = pending.current;
            pending.current = null;
            if (run === null) return;
            event.preventDefault();
            run();
          }}
          // A menu floats, so it takes radius 12 and the one shadow
          // (ADR-0033 §7). bg-gray-2, not gray-3: leaves the highlighted state
          // below free to read as hover (#388).
          className="min-w-32 rounded-float border border-gray-7 bg-gray-2 p-tight shadow-float"
        >
          {heading ? (
            <div className="px-inline py-tight text-gray-11 text-meta">
              {heading}
            </div>
          ) : null}
          {orderedItems(items).map((item, index, ordered) => {
            const previous = ordered[index - 1];
            // Danger stands alone, last, behind its own divider (#1009). A
            // link and an action never share a group without one either
            // (#994) — the caller's own order says which comes first.
            const separator =
              previous !== undefined &&
              (item.danger !== previous.danger ||
                (!item.danger &&
                  (item.href === undefined) !== (previous.href === undefined)));
            return (
              <Fragment key={item.label}>
                {separator ? (
                  <DropdownMenu.Separator className="-mx-tight my-tight h-px bg-gray-6" />
                ) : null}
                {/* Not Radix's `disabled`: that drops the item from the
                    keyboard, and design.md keeps it focusable (#1067). */}
                <DropdownMenu.Item
                  aria-disabled={item.disabled || undefined}
                  data-disabled={item.disabled ? "" : undefined}
                  onSelect={(event) => {
                    if (item.disabled) {
                      event.preventDefault();
                      return;
                    }
                    if (returnFocus) item.onSelect?.();
                    else pending.current = item.onSelect ?? null;
                  }}
                  asChild={item.href !== undefined}
                  className={cn(
                    "flex h-control cursor-pointer items-center rounded-control px-inline font-ui text-row no-underline outline-none",
                    HOVER_TRANSITION,
                    // data-[highlighted]: Radix's hover + roving focus. gray-3,
                    // not gray-4 — an item is never a standing choice (#388).
                    item.danger
                      ? "text-red-11 data-[highlighted]:bg-red-3 data-[highlighted]:text-red-12"
                      : "text-gray-11 data-[highlighted]:bg-gray-3 data-[highlighted]:text-gray-12",
                    // Stacked so a focused disabled item still reads dim.
                    "data-[disabled]:cursor-not-allowed data-[disabled]:text-dim data-[disabled]:data-[highlighted]:text-dim",
                  )}
                >
                  {item.href === undefined ? (
                    item.label
                  ) : (
                    <a href={item.href} target="_blank" rel="noreferrer">
                      {item.label}
                    </a>
                  )}
                </DropdownMenu.Item>
              </Fragment>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
