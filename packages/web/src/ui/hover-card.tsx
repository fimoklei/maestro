import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import { type ReactNode, useCallback, useEffect, useState } from "react";

// Holds no control: the detail pane keeps the full reading.

const OPEN_DELAY = 400;
const CLOSE_DELAY = 150;
// px: the inline spacing step, 0.5rem.
const GUTTER = 8;

export function HoverCard({
  content,
  focused = false,
  children,
}: {
  content: ReactNode;
  /** Set by an owner that holds focus itself, as a grid does for its active row. */
  focused?: boolean;
  /** One element; it becomes the trigger. */
  children: ReactNode;
}) {
  const [pointerOpen, setPointerOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  // The card stays inside the panel its trigger sits in, a gutter from its edge.
  const [panel, setPanel] = useState<Element | null>(null);
  const findPanel = useCallback(
    (trigger: HTMLElement | null) =>
      setPanel(trigger?.closest("[data-panel]") ?? null),
    [],
  );

  // Focus opens the card at once; only the pointer waits.
  useEffect(() => {
    if (focused) {
      setFocusOpen(true);
      return;
    }
    const timer = setTimeout(() => setFocusOpen(false), CLOSE_DELAY);
    return () => clearTimeout(timer);
  }, [focused]);

  return (
    <HoverCardPrimitive.Root
      open={pointerOpen || focusOpen}
      onOpenChange={(next) => {
        setPointerOpen(next);
        if (!next) setFocusOpen(false);
      }}
      openDelay={OPEN_DELAY}
      closeDelay={CLOSE_DELAY}
    >
      <HoverCardPrimitive.Trigger
        ref={findPanel}
        asChild
        // Radix ignores touch, so a tap toggles the card here.
        onPointerUp={(event) => {
          if (event.pointerType === "touch") setPointerOpen((open) => !open);
        }}
      >
        {children}
      </HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionBoundary={panel}
          collisionPadding={GUTTER}
          className="z-50 w-72 rounded-float border border-gray-7 bg-gray-2 p-cell font-ui text-gray-12 text-meta shadow-float"
        >
          {content}
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
}
