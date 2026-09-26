import * as Dialog from "@radix-ui/react-dialog";
import { type ReactNode, useRef } from "react";
import { cn } from "./cn";

// Radix owns the portal, focus trap, focus return and scroll lock (#997); this
// file owns the frame and the two refusals to close.

// Tailwind reads whole class names, so each is written out.
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

/** The footer every dialog closes on: Cancel leading, the confirm trailing. */
export const DIALOG_FOOTER =
  "flex shrink-0 items-center justify-between gap-inline border-edge border-t px-panel py-cell";

/** The Cancel control a destructive dialog opens its focus on. */
export const DIALOG_CANCEL = { "data-dialog-cancel": "" };

export interface DialogShellProps {
  /** The panel's accessible name — the same words as its visible heading. */
  label: string;
  /** Ids of the elements that describe the panel; required, so `null` is explicit. */
  describedBy: string | null;
  width: keyof typeof WIDTH;
  height?: keyof typeof HEIGHT;
  /** Outline class — a fixed token, or `panelBorderFor` where the news decides it. */
  border?: string;
  onClose: () => void;
  /** False while a request is in flight — its outcome is readable nowhere else. */
  closeEnabled?: boolean;
  /** Focus opens on `DIALOG_CANCEL`, so Enter never confirms by accident. */
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
  border = "border-gray-7",
  onClose,
  closeEnabled = true,
  destructive = false,
  fieldsChanged = false,
  children,
}: DialogShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Radix returns focus to its own Trigger, which these dialogs never use.
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
            // A close that sent the reader on — a pane that took focus — keeps
            // them there; only a lost focus goes back to the opener.
            const active = document.activeElement;
            const lost =
              active === null ||
              active === document.body ||
              panelRef.current?.contains(active) === true;
            if (!lost) return;
            const opener = openerRef.current;
            if (opener instanceof HTMLElement) opener.focus();
          }}
          onInteractOutside={(event) => {
            if (!closeEnabled || fieldsChanged) event.preventDefault();
          }}
          className={cn(
            // Top-aligned, not centred: a growing dialog keeps its header still.
            "-translate-x-1/2 fixed top-24 left-1/2 z-50 flex w-[calc(100%-2rem)] flex-col overflow-hidden rounded-float border bg-gray-2 shadow-float outline-none",
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
