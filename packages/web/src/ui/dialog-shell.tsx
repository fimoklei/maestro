import * as Dialog from "@radix-ui/react-dialog";
import { type ReactNode, useRef } from "react";
import { cn } from "./cn";

// The overlay, the dismissing backdrop and the panel wired to the keyboard
// contract — one owner, so a dialog supplies only what makes it that one.
// Radix owns the portal, the focus trap, the return of focus and the scroll
// lock (#997); this file owns the frame and the two refusals to close.

// Two widths, nothing between them (ADR-0033 §6). Tailwind reads whole class
// names, so each is written out.
const WIDTH = {
  480: "max-w-[480px]",
  640: "max-w-[640px]",
} as const;

// Capped either way, so a long body scrolls instead of pushing the footer off
// the screen. "compact" leaves the screen behind a picker readable.
const HEIGHT = {
  viewport: "max-h-[calc(100vh-9rem)]",
  tall: "max-h-[calc(100vh-9rem)]",
  compact: "max-h-[70vh]",
} as const;

/** The Cancel control a destructive dialog opens its focus on. */
export const DIALOG_CANCEL = { "data-dialog-cancel": "" };

export interface DialogShellProps {
  /** The panel's accessible name — the same words as its visible heading. */
  label: string;
  /**
   * Ids of the on-screen elements that describe the panel, or `null` where
   * nothing on screen does. Required, so no dialog omits one by accident.
   */
  describedBy: string | null;
  width: keyof typeof WIDTH;
  height?: keyof typeof HEIGHT;
  /** Outline class — a fixed token, or `panelBorderFor` where the news decides it. */
  border?: string;
  onClose: () => void;
  /** False while a request is in flight — its outcome is readable nowhere else. */
  closeEnabled?: boolean;
  /**
   * This dialog deletes files or writes to GitHub: focus opens on the control
   * spread with `DIALOG_CANCEL`, so Enter never confirms by accident.
   */
  destructive?: boolean;
  /** A field has been typed in — a click outside must not discard that work. */
  fieldsChanged?: boolean;
  children: ReactNode;
}

export function DialogShell({
  label,
  describedBy,
  width,
  height = "viewport",
  border = "border-line-row",
  onClose,
  closeEnabled = true,
  destructive = false,
  fieldsChanged = false,
  children,
}: DialogShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Radix returns focus to its own Trigger, and these dialogs are opened from
  // a control it never saw. The control that had focus at open is the one to
  // come back to, so it is remembered here.
  const openerRef = useRef<Element | null>(
    typeof document === "undefined" ? null : document.activeElement,
  );

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && closeEnabled) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-backdrop" />
        <Dialog.Content
          ref={panelRef}
          // Radix hides the rest of the tree instead of stating modality;
          // the attribute says it out loud as well.
          aria-modal="true"
          aria-label={label}
          aria-describedby={describedBy ?? undefined}
          onOpenAutoFocus={(event) => {
            // The panel, not its first control: a dialog that opens on Cancel
            // or on a confirm reads its body to nobody. The one exception is
            // the destructive one, where Cancel is the safe landing.
            event.preventDefault();
            const cancel = destructive
              ? panelRef.current?.querySelector<HTMLElement>(
                  "[data-dialog-cancel]",
                )
              : null;
            (cancel ?? panelRef.current)?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const opener = openerRef.current;
            if (opener instanceof HTMLElement) opener.focus();
          }}
          onInteractOutside={(event) => {
            if (!closeEnabled || fieldsChanged) event.preventDefault();
          }}
          className={cn(
            // Top-aligned at 96px (ADR-0033 §6), not centred: a dialog that
            // grows keeps its header where the reader's eye already is.
            "-translate-x-1/2 fixed top-24 left-1/2 z-50 flex w-[calc(100%-2rem)] flex-col overflow-hidden rounded-float border bg-chrome shadow-float outline-none",
            WIDTH[width],
            HEIGHT[height],
            border,
          )}
        >
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
