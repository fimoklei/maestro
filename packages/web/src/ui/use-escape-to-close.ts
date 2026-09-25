import { useCallback, useEffect, useRef } from "react";

// Escape-closes half of the keyboard contract. A shared stack, not a
// per-panel listener, so with two panels open Escape acts only on the top one.
type StackEntry = {
  closeEnabledRef: { readonly current: boolean };
  onCloseRef: { readonly current: () => void };
};

const stack: StackEntry[] = [];
let listenerAttached = false;

function handleDocumentKeyDown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  // An open menu's or dialog's Escape closes it alone, never the panel behind
  // it (#1124).
  if ((event.target as Element | null)?.closest?.("[role=menu],[role=dialog]"))
    return;
  const top = stack[stack.length - 1];
  if (!top) return;
  if (!top.closeEnabledRef.current) return;
  event.preventDefault();
  top.onCloseRef.current();
}

function ensureListenerAttached() {
  if (listenerAttached) return;
  listenerAttached = true;
  document.addEventListener("keydown", handleDocumentKeyDown);
}

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
    ensureListenerAttached();
    const entry: StackEntry = { onCloseRef, closeEnabledRef };
    stack.push(entry);
    return () => {
      const index = stack.indexOf(entry);
      if (index !== -1) stack.splice(index, 1);
    };
  }, []);

  return {
    requestClose: useCallback(() => {
      if (closeEnabledRef.current) {
        onCloseRef.current();
      }
    }, []),
  };
}
