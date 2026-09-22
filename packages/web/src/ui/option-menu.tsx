import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { Button } from "./button";
import { cn } from "./cn";
import { HOVER_TRANSITION } from "./hover-transition";
import { IconButton } from "./icon-button";
import { Tooltip } from "./tooltip";

// Band 2's Filter and Display: shadcn's dropdown-menu radio and check items.

type Option = { value: string; label: string };

export type OptionSection = { label: string; options: readonly Option[] } & (
  | { kind: "radio"; value: string; onChange: (value: string) => void }
  | {
      kind: "check";
      values: ReadonlySet<string>;
      onToggle: (value: string) => void;
    }
);

export interface OptionMenuProps {
  /** The control's action, e.g. "Filter". */
  label: string;
  icon: ReactNode;
  sections: readonly OptionSection[];
  /** How many options are set; shown on the control so a filter is never invisible. */
  count?: number;
  /** Why the control cannot be used, in five words or fewer (copy.md). */
  unavailable?: string;
}

const itemClasses = cn(
  "flex h-control cursor-pointer items-center gap-inline rounded-control px-inline font-ui text-gray-11 text-row outline-none",
  HOVER_TRANSITION,
  "data-[highlighted]:bg-gray-3 data-[highlighted]:text-gray-12",
);

export function OptionMenu({
  label,
  icon,
  sections,
  count = 0,
  unavailable,
}: OptionMenuProps) {
  if (unavailable) {
    return (
      <IconButton label={label} unavailable={unavailable}>
        {icon}
      </IconButton>
    );
  }

  const name = count > 0 ? `${label}, ${count} active` : label;

  return (
    <DropdownMenu.Root>
      <Tooltip label={name}>
        <DropdownMenu.Trigger asChild>
          <Button
            size="icon"
            variant="quiet"
            aria-label={name}
            className="relative"
          >
            {icon}
            {count > 0 ? (
              <span
                aria-hidden="true"
                className="-top-1.5 -right-1.5 absolute grid h-4 min-w-4 place-items-center rounded-full bg-gray-12 px-tight text-gray-1 text-meta tabular-nums"
              >
                {count}
              </span>
            ) : null}
          </Button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-44 rounded-float border border-gray-7 bg-gray-2 p-tight shadow-float"
        >
          {sections.map((section, index) => (
            <DropdownMenu.Group key={section.label}>
              {index > 0 ? (
                <DropdownMenu.Separator className="my-tight h-px bg-gray-6" />
              ) : null}
              <DropdownMenu.Label className="px-inline py-tight text-gray-11 text-meta">
                {section.label}
              </DropdownMenu.Label>
              {section.kind === "radio" ? (
                <DropdownMenu.RadioGroup
                  value={section.value}
                  onValueChange={section.onChange}
                >
                  {section.options.map((option) => (
                    <DropdownMenu.RadioItem
                      key={option.value}
                      value={option.value}
                      className={itemClasses}
                    >
                      <Mark>
                        <DropdownMenu.ItemIndicator>
                          ●
                        </DropdownMenu.ItemIndicator>
                      </Mark>
                      {option.label}
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              ) : (
                section.options.map((option) => (
                  <DropdownMenu.CheckboxItem
                    key={option.value}
                    checked={section.values.has(option.value)}
                    onCheckedChange={() => section.onToggle(option.value)}
                    // Stays open: a reader sets several options in one visit.
                    onSelect={(event) => event.preventDefault()}
                    className={itemClasses}
                  >
                    <Mark>
                      <DropdownMenu.ItemIndicator>✓</DropdownMenu.ItemIndicator>
                    </Mark>
                    {option.label}
                  </DropdownMenu.CheckboxItem>
                ))
              )}
            </DropdownMenu.Group>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Mark({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="grid w-4 place-items-center text-gray-12"
    >
      {children}
    </span>
  );
}
