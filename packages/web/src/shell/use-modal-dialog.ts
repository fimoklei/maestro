import { useEffect, useRef } from "react";
import { useEscapeToClose } from "./use-escape-to-close";

// The keyboard contract of a modal, in one place (issue #214): on open, focus
// moves into the panel; on close, it returns to the trigger that opened it;
// Escape closes it; and Tab is trapped so the page behind stays unreachable.
// The caller passes whether closing is allowed right now — the browse dialog
// blocks it while a registration is in flight, matching the disabled ✕.
//
// Escape and the Tab trap listen on the whole document, not just the panel:
// navigating into a folder unmounts the focused row and drops focus to <body>,
// and a panel-scoped listener would go deaf the moment that happens. Listening
// at the document keeps both working from anywhere, and Tab from outside the
// panel pulls focus back in rather than reaching a control behind the dialog.
//
// Focus save/restore is self-contained: the trigger is whatever held focus when
// the dialog mounted, so no container has to thread a ref down. Wire the panel
// with the returned ref, and the overlay with requestClose.

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function focusablesWithin(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
}

export function useModalDialog({
  onClose,
  closeEnabled,
}: {
  onClose: () => void;
  closeEnabled: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { requestClose } = useEscapeToClose({ onClose, closeEnabled });

  useEffect(() => {
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // The panel itself takes focus (it is tabindex=-1), so a screen reader
    // announces the dialog's name and the first Tab steps to the first control.
    panelRef.current?.focus();
    return () => {
      trigger?.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const panel = panelRef.current;
      if (!panel) return;
      if (event.key !== "Tab") return;

      const focusables = focusablesWithin(panel);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const active = document.activeElement;
      const insideControl = panel.contains(active) && active !== panel;
      if (!insideControl) {
        // Focus escaped the panel (or rests on the panel container) — pull it to
        // an end control instead of letting Tab reach the page behind.
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return { panelRef, requestClose };
}
