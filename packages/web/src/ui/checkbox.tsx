import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "./cn";

// Checked is gray 1 on gray 12: white on blue 9 is not a documented pair.

export function Checkbox({
  className,
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-chip border border-gray-9 bg-gray-1 text-gray-1",
        "data-[state=checked]:border-gray-12 data-[state=checked]:bg-gray-12",
        "data-[state=indeterminate]:border-gray-12 data-[state=indeterminate]:bg-gray-12",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="group flex items-center justify-center">
        <Check
          aria-hidden="true"
          strokeWidth={2.5}
          className="size-3 group-data-[state=indeterminate]:hidden"
        />
        <Minus
          aria-hidden="true"
          strokeWidth={2.5}
          className="hidden size-3 group-data-[state=indeterminate]:block"
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
