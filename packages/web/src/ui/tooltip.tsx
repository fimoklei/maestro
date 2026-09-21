import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

// shadcn/ui's tooltip on Radix, restyled to the tokens (ADR-0033). It names a
// control that shows no words of its own; it never holds one.

// The provider sits inside, not at the composition root: a tooltip then works
// wherever it is rendered, including in a story and in a sibling unit test.
export function Tooltip({
  label,
  children,
}: {
  /** The same words as the control's accessible name (design.md). */
  label: string;
  children: ReactNode;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            // aria-hidden: the trigger already carries these words as its
            // accessible name, and Radix would announce them a second time.
            aria-hidden="true"
            className="z-50 rounded-control border border-gray-7 bg-gray-2 px-inline py-tight text-gray-12 text-meta shadow-float"
          >
            {label}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
