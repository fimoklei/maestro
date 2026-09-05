import type { ReactNode } from "react";
import { useModalDialog } from "../shell/use-modal-dialog";
import { cn } from "./cn";

// The overlay, the dismissing backdrop and the panel wired to the keyboard
// contract — one owner, so a dialog supplies only what makes it that one.

// Tailwind reads whole class names, so each width is written out.
const WIDTH = {
  460: "max-w-[460px]",
  480: "max-w-[480px]",
  520: "max-w-[520px]",
  560: "max-w-[560px]",
  620: "max-w-[620px]",
} as const;

// Capped either way, so a long body scrolls instead of pushing the footer off
// the screen. "compact" leaves the screen behind a picker readable.
const HEIGHT = {
  viewport: "max-h-[calc(100vh-3rem)]",
  tall: "max-h-[90vh]",
  compact: "max-h-[70vh]",
} as const;

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
  children,
}: DialogShellProps) {
  const { panelRef, requestClose } = useModalDialog({ onClose, closeEnabled });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-6">
      {/* Real button, hidden from a11y tree and tab order: backdrop dismiss
          without making a static div interactive. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={requestClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-describedby={describedBy ?? undefined}
        tabIndex={-1}
        className={cn(
          "relative flex w-full flex-col overflow-hidden rounded-card border bg-chrome outline-none",
          WIDTH[width],
          HEIGHT[height],
          border,
        )}
      >
        {children}
      </div>
    </div>
  );
}
