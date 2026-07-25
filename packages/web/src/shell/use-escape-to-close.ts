import { useCallback, useEffect, useRef } from "react";

// The Escape-closes half of the keyboard contract, shared by every dismissible
// panel: a true modal (useModalDialog, which adds a Tab trap on top) and a
// non-modal one like the skill detail pane (ADR-0016 — side-by-side, not an
// overlay, so it never traps Tab). Listens on the document, not the panel,
// for the same reason useModalDialog does: a panel-scoped listener goes deaf
// the moment its contents unmount focus out from under it.
//
// Returns `requestClose`, the same closeEnabled-gated close useModalDialog's
// overlay click wires up — so a caller that also needs a click-to-close
// affordance (the overlay) reuses this hook's guard instead of keeping its
// own copy of the same onClose/closeEnabled refs.
export function useEscapeToClose({
  onClose,
  closeEnabled = true,
}: {
  onClose: () => void;
  closeEnabled?: boolean;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeEnabledRef = useRef(closeEnabled);
  closeEnabledRef.current = closeEnabled;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (!closeEnabledRef.current) return;
      event.preventDefault();
      onCloseRef.current();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return {
    requestClose: useCallback(() => {
      if (closeEnabledRef.current) {
        onCloseRef.current();
      }
    }, []),
  };
}
