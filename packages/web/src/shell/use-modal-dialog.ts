import { useEffect, useRef } from "react";
import { useEscapeToClose } from "./use-escape-to-close";

// Modal keyboard contract (#214). Document-level, not panel-scoped:
// navigating into a folder unmounts the focused row and drops focus to <body>.

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
        // Focus escaped the panel — pull it to an end control.
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
