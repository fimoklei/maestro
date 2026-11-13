import * as Popover from "@radix-ui/react-popover";
import { type ReactNode, useRef } from "react";
import { cn } from "./cn";

/**
 * Floats a menu over the screen or dialog from the control that opens it,
 * flipping above it where the space below runs out. Focus opens on the menu's
 * first field and returns to the control on close; the menu inside owns
 * Escape and the press outside.
 */
export function AnchoredFloat({
  open,
  anchor,
  width,
  children,
}: {
  open: boolean;
  /** The opening control, which the menu floats from. */
  anchor: ReactNode;
  /** `anchor` matches the control's width; `menu` keeps a fixed 240px, aligned to its end. */
  width: "anchor" | "menu";
  children: ReactNode;
}) {
  const anchorBox = useRef<HTMLDivElement>(null);
  return (
    // Modal, so the dialog behind lets the menu's list scroll.
    <Popover.Root open={open} modal>
      <Popover.Anchor
        ref={anchorBox}
        className={width === "anchor" ? "w-full" : "inline-flex"}
      >
        {anchor}
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align={width === "anchor" ? "start" : "end"}
          sideOffset={4}
          collisionPadding={16}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            anchorBox.current?.querySelector("button")?.focus();
          }}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onFocusOutside={(event) => event.preventDefault()}
          className={cn(
            // The menu takes the cap itself: a fieldset's own flex box
            // shrinks only to a height it holds.
            "z-50 flex max-h-[var(--radix-popover-content-available-height)] min-h-0 flex-col outline-none [&>*]:max-h-[inherit]",
            width === "anchor"
              ? "w-[var(--radix-popover-trigger-width)]"
              : "w-60",
          )}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
