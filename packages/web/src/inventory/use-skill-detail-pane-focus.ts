import { useEffect, useRef } from "react";
import { useEscapeToClose } from "../shell/use-escape-to-close";

// No Tab trap (ADR-0016: side-by-side, not a dialog). Keyed on `activeKey`,
// not mount, since one pane instance swaps its `primitive` prop.
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
    // A lookup, not a resolved element: the row can remount as a new DOM
    // node while this effect doesn't re-run, so it resolves fresh at close.
    return () => {
      getTriggerElement(activeKey)?.focus();
    };
  }, [activeKey, getTriggerElement]);

  useEscapeToClose({ onClose });

  return { headingRef };
}
