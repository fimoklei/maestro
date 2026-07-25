import { useEffect, useRef } from "react";
import { useEscapeToClose } from "../shell/use-escape-to-close";

// The pane's keyboard contract: Escape closes it, and — because ADR-0016
// makes it a side-by-side panel rather than a dialog — focus moves to its
// heading on open and back to the row button that opened it on close. No Tab
// trap: that's the one piece of useModalDialog's contract this pane doesn't
// want, so it composes the shared Escape half (use-escape-to-close.ts)
// instead of the whole hook.
//
// Keyed on `activeKey` (the open skill's name), not mount: inventory-list
// keeps one pane instance and only swaps its `primitive` prop when the
// selection moves to a different row, so a mount-only effect would miss that
// switch entirely.
//
// `getTriggerElement` is a lookup, not a resolved element: selection persists
// across a narrowing search (the pane stays open on a row hidden by the
// filter), so the row can unmount and remount — a new DOM node — while this
// hook's effect never re-runs (activeKey hasn't changed). Resolving the
// trigger once, at open time, would go stale the moment that happens; calling
// the lookup inside the cleanup instead resolves it fresh, at the actual
// moment of closing, against whichever row button currently exists.
export function useSkillDetailPaneFocus({
  activeKey,
  getTriggerElement,
  onClose,
}: {
  activeKey: string;
  getTriggerElement: (key: string) => HTMLElement | null;
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    return () => {
      getTriggerElement(activeKey)?.focus();
    };
  }, [activeKey, getTriggerElement]);

  useEscapeToClose({ onClose });

  return { headingRef };
}
