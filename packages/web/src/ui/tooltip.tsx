import { Slot } from "@radix-ui/react-slot";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { type ComponentProps, type ReactNode, useId } from "react";

// Never holds a control.

// The provider sits inside, so a tooltip works in stories and unit tests too.
export function Tooltip({
  label,
  detail,
  children,
}: {
  /** The trigger's accessible name, or the whole of its shortened text. */
  label: string;
  /** A reason under the label; the trigger's description, said once. */
  detail?: string;
  children: ReactNode;
}) {
  const contentId = useId();
  return (
    <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          {/* A label-only tooltip repeats the name; Radix would describe with it. */}
          <TriggerTarget
            omitDescription={detail === undefined ? contentId : null}
          >
            {children}
          </TriggerTarget>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            id={contentId}
            sideOffset={6}
            // aria-hidden: the trigger already carries these words as its
            // accessible name, and Radix would announce them a second time.
            // Radix makes aria-label the description, so the reason alone.
            aria-hidden="true"
            aria-label={detail}
            // Escape dismisses the tooltip alone, not the panel around it.
            onEscapeKeyDown={(event) => event.stopPropagation()}
            className="z-50 max-w-80 wrap-anywhere rounded-control border border-gray-7 bg-gray-2 px-inline py-tight text-gray-12 text-meta shadow-float"
          >
            {label}
            {detail === undefined ? null : (
              <span className="block text-gray-11">{detail}</span>
            )}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

// Radix joins the content id onto any aria-describedby the child carries, so
// it is taken out here, after the join.
function TriggerTarget({
  omitDescription,
  "aria-describedby": describedBy,
  ...rest
}: ComponentProps<typeof Slot> & { omitDescription: string | null }) {
  const ids = describedBy
    ?.split(/\s+/)
    .filter((id) => id !== "" && id !== omitDescription)
    .join(" ");
  return <Slot {...rest} aria-describedby={ids === "" ? undefined : ids} />;
}
