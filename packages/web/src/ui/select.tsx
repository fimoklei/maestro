import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./cn";
import { HOVER_TRANSITION } from "./hover-transition";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  /** The id of the visible label that names this control. */
  labelledBy: string;
  value: string;
  options: readonly SelectOption[];
  onValueChange: (value: string) => void;
}

export function Select({
  labelledBy,
  value,
  options,
  onValueChange,
}: SelectProps) {
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange}>
      <RadixSelect.Trigger
        aria-labelledby={labelledBy}
        className={cn(
          "inline-flex h-control min-w-32 cursor-pointer items-center justify-between gap-inline rounded-control border border-edge bg-transparent px-cell font-medium font-ui text-gray-12 text-row",
          HOVER_TRANSITION,
          "hover:bg-gray-3 data-[state=open]:bg-gray-3",
        )}
      >
        <RadixSelect.Value />
        <RadixSelect.Icon className="text-gray-11">
          <ChevronDown aria-hidden="true" className="size-4" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          align="end"
          sideOffset={4}
          className="z-50 min-w-[var(--radix-select-trigger-width)] rounded-float border border-gray-7 bg-gray-2 p-tight shadow-float"
        >
          <RadixSelect.Viewport>
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                className={cn(
                  "flex h-control cursor-pointer items-center gap-inline rounded-control px-inline font-ui text-gray-11 text-row outline-none",
                  HOVER_TRANSITION,
                  "data-[highlighted]:bg-gray-3 data-[highlighted]:text-gray-12 data-[state=checked]:text-gray-12",
                )}
              >
                <span
                  aria-hidden="true"
                  className="grid w-4 place-items-center"
                >
                  <RadixSelect.ItemIndicator>
                    <Check className="size-4" />
                  </RadixSelect.ItemIndicator>
                </span>
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
