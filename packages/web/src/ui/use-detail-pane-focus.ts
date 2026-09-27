import { useEffect, useRef } from "react";
import { type DismissedBy, useDismiss } from "./use-dismiss";

// No Tab trap: the pane is not a dialog. Keyed on `activeKey`, not mount,
// since one pane instance pages through its subjects.
export function useDetailPaneFocus({
  activeKey,
  getTriggerElement,
  onClose,
  initialFocus,
}: {
  activeKey: string;
  getTriggerElement: (key: string) => HTMLElement | null;
  onClose: () => void;
  /** A selector inside the pane; undefined is the heading, null leaves focus. */
  initialFocus: string | null | undefined;
}) {
  const paneRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const initialFocusRef = useRef(initialFocus);
  initialFocusRef.current = initialFocus;
  const dismissedByRef = useRef<DismissedBy | null>(null);

  useEffect(() => {
    // Here, not in the child's autoFocus: an effect re-runs after React's
    // development remount, which would otherwise hand focus back to the table.
    dismissedByRef.current = null;
    const selector = initialFocusRef.current;
    const target =
      selector === undefined
        ? headingRef.current
        : selector === null
          ? null
          : paneRef.current?.querySelector<HTMLElement>(selector);
    target?.focus();
    const pane = paneRef.current;
    // A lookup, not a resolved element: the row can remount as a new DOM
    // node while this effect doesn't re-run, so it resolves fresh at close.
    return () => {
      // A press that closed the pane on another control leaves focus there.
      const active = document.activeElement;
      const pressedElsewhere =
        dismissedByRef.current === "press" &&
        active !== null &&
        active !== document.body &&
        active.isConnected &&
        pane?.contains(active) !== true;
      if (!pressedElsewhere) getTriggerElement(activeKey)?.focus();
    };
  }, [activeKey, getTriggerElement]);

  useDismiss({
    containerRef: paneRef,
    onClose: (via) => {
      dismissedByRef.current = via;
      onClose();
    },
  });

  return { paneRef, headingRef };
}
