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
//
// Two panels can be open at once on /inventory — the skill detail pane and,
// behind "+ repo", the browse dialog. Each used to register its own document
// keydown listener, so one Escape press closed both, and a topmost panel that
// currently disallows closing (the dialog mid-registration) still let Escape
// fall through and close whatever was open underneath it. A single shared
// stack fixes both: every mounted panel pushes itself on open and pops on
// close, one document listener (installed once, for the app's lifetime) acts
// only on the top entry, and it does nothing at all — never falls through —
// when that top entry currently disallows closing.
type StackEntry = {
  closeEnabledRef: { readonly current: boolean };
  onCloseRef: { readonly current: () => void };
};

const stack: StackEntry[] = [];
let listenerAttached = false;

function handleDocumentKeyDown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
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
