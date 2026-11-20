import { Slot } from "@radix-ui/react-slot";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { type ComponentProps, type ReactNode, useId } from "react";
import { type Copy, plainText } from "./phrase";
import { PhraseText } from "./phrase-text";

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
  detail?: Copy;
  children: ReactNode;
}) {
  const contentId = useId();
  return (
    <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <TriggerTarget contentId={contentId} detail={detail}>
            {children}
          </TriggerTarget>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            id={contentId}
            sideOffset={6}
            // aria-hidden: the trigger already carries these words as its
            // name and description.
            aria-hidden="true"
            // Escape dismisses the tooltip alone, not the panel around it.
            onEscapeKeyDown={(event) => event.stopPropagation()}
            className="z-50 max-w-80 wrap-anywhere rounded-control border border-gray-7 bg-gray-2 px-inline py-tight text-gray-12 text-meta shadow-float"
          >
            {label}
            {detail === undefined ? null : (
              <span className="block text-gray-11">
                <PhraseText copy={withoutLinks(detail)} />
              </span>
            )}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

// A link reads as its words: the tooltip opens on hover, so a press never reaches it.
const withoutLinks = (copy: Copy): Copy =>
  typeof copy === "string"
    ? copy
    : {
        parts: copy.parts.map((part) =>
          typeof part !== "string" && part.kind === "link" ? part.text : part,
        ),
      };

// Radix joins the content id onto any aria-describedby the child carries, and
// only while open; the detail describes the trigger while closed too.
function TriggerTarget({
  contentId,
  detail,
  "aria-describedby": describedBy,
  ...rest
}: ComponentProps<typeof Slot> & {
  contentId: string;
  detail: Copy | undefined;
}) {
  const ids = describedBy
    ?.split(/\s+/)
    .filter((id) => id !== "" && id !== contentId)
    .join(" ");
  return (
    <Slot
      {...rest}
      aria-describedby={ids === "" ? undefined : ids}
      aria-description={detail === undefined ? undefined : plainText(detail)}
    />
  );
}
