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
// The return target is a prop, not `document.activeElement` read inside this
// hook: on a row-to-row switch this effect's own cleanup (for the row being
// left) fires and moves focus to that row's trigger a beat before the new
// effect would read `document.activeElement` — reading it here would just
// observe the value this same hook wrote. The caller already knows which row
// button opened the pane, so it hands that element in directly.
export function useSkillDetailPaneFocus({
  activeKey,
  triggerElement,
  onClose,
}: {
  activeKey: string;
  triggerElement: HTMLElement | null;
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: activeKey re-keys this effect per open skill; triggerElement alone would miss a caller reusing the same element across two different skills.
  useEffect(() => {
    headingRef.current?.focus();
    return () => {
      triggerElement?.focus();
    };
  }, [activeKey, triggerElement]);

  useEscapeToClose({ onClose });

  return { headingRef };
}
