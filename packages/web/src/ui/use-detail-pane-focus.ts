import { useEffect, useRef } from "react";
import { useEscapeToClose } from "./use-escape-to-close";

// No Tab trap (ADR-0016: side-by-side, not a dialog). Keyed on `activeKey`,
// not mount, since one pane instance pages through its subjects.
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

  useEffect(() => {
    // Here, not in the child's autoFocus: an effect re-runs after React's
    // development remount, which would otherwise hand focus back to the table.
    const selector = initialFocusRef.current;
    const target =
      selector === undefined
        ? headingRef.current
        : selector === null
          ? null
          : paneRef.current?.querySelector<HTMLElement>(selector);
    target?.focus();
    // A lookup, not a resolved element: the row can remount as a new DOM
    // node while this effect doesn't re-run, so it resolves fresh at close.
    return () => {
      getTriggerElement(activeKey)?.focus();
    };
  }, [activeKey, getTriggerElement]);

  useEscapeToClose({ onClose });

  return { paneRef, headingRef };
}
