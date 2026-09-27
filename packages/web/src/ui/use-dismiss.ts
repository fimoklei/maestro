import { type RefObject, useEffect, useRef } from "react";

// A shared stack, so with two panels open only the top one is dismissed.
type StackEntry = {
  containerRef: RefObject<HTMLElement | null>;
  closeEnabledRef: { readonly current: boolean };
  onCloseRef: { readonly current: (via: DismissedBy) => void };
};

export type DismissedBy = "escape" | "press";

// An open menu or dialog takes its own Escape and outside press, never the
// panel behind it (#1124). Radix portals both outside the panel.
const OVERLAY = "[role=menu],[role=dialog]";

const stack: StackEntry[] = [];
let listenersAttached = false;
// Armed by a pointer press, so a control outside the panel activated from the
// keyboard, which clicks without a press, leaves it open.
let pressedOutside: StackEntry | null = null;

const top = () => stack.at(-1);

function closeIfTop(entry: StackEntry | undefined, via: DismissedBy) {
  if (!entry || entry !== top()) return false;
  if (!entry.closeEnabledRef.current) return false;
  entry.onCloseRef.current(via);
  return true;
}

function handleDocumentKeyDown(event: KeyboardEvent) {
  pressedOutside = null;
  if (event.key !== "Escape") return;
  if ((event.target as Element | null)?.closest?.(OVERLAY)) return;
  if (closeIfTop(top(), "escape")) event.preventDefault();
}

function handleDocumentPointerDown(event: PointerEvent) {
  pressedOutside = null;
  const entry = top();
  const target = event.target;
  if (!entry || !(target instanceof Element)) return;
  if (document.querySelector(OVERLAY)) return;
  if (entry.containerRef.current?.contains(target)) return;
  // A table's row moves the panel to it rather than closing it.
  if (target.closest("[role=grid] tbody tr")) return;
  pressedOutside = entry;
}

// On click, not on press: by then the press has moved focus where it lands.
function handleDocumentClick() {
  const entry = pressedOutside;
  pressedOutside = null;
  if (entry) closeIfTop(entry, "press");
}

function ensureListenersAttached() {
  if (listenersAttached) return;
  listenersAttached = true;
  document.addEventListener("keydown", handleDocumentKeyDown);
  // Capture: a menu's own outside press must not close it before this looks.
  document.addEventListener("pointerdown", handleDocumentPointerDown, true);
  document.addEventListener("click", handleDocumentClick);
}

/** Closes a panel on Escape or on a pointer press outside `containerRef`. */
export function useDismiss({
  containerRef,
  onClose,
  closeEnabled = true,
}: {
  containerRef: RefObject<HTMLElement | null>;
  onClose: (via: DismissedBy) => void;
  closeEnabled?: boolean;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeEnabledRef = useRef(closeEnabled);
  closeEnabledRef.current = closeEnabled;

  useEffect(() => {
    ensureListenersAttached();
    const entry: StackEntry = { containerRef, onCloseRef, closeEnabledRef };
    stack.push(entry);
    return () => {
      const index = stack.indexOf(entry);
      if (index !== -1) stack.splice(index, 1);
      if (pressedOutside === entry) pressedOutside = null;
    };
  }, [containerRef]);
}
