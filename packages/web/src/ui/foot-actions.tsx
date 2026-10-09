import { ArrowUpRight } from "lucide-react";
import { type ActionsMenuItem, orderedItems } from "./actions-menu";
import { ACTIONS, type ActionKey } from "./busy-copy";
import { Button } from "./button";
import { cn } from "./cn";
import { Icon } from "./icon";

// The row's ⋮ items as buttons, at most one of them primary.
export type FootItem = ActionsMenuItem & {
  /** The accessible name where the label alone would not say what it acts on. */
  name?: string;
  /** The next step its state names, which ranks it for the pane's primary. */
  step?: "update" | "import";
  /** Its write is running: picks the busy label from `busy-copy`. */
  busy?: ActionKey;
};

// The primary where the ⋮ order already leads with the next step (#1065).
export const firstEnabled = (items: readonly FootItem[]): string | null =>
  items.find(
    (item) => item.href === undefined && !item.disabled && !item.danger,
  )?.label ?? null;

export function FootActions({
  items,
  primary,
}: {
  items: readonly FootItem[];
  /** The label of the one primary item, or null for none. */
  primary: string | null;
}) {
  const ordered = orderedItems(items);
  return (
    <>
      {ordered.map((item) =>
        item.href === undefined ? (
          <Button
            key={item.label}
            size="md"
            variant={
              item.danger
                ? "danger"
                : item.label === primary
                  ? "primary"
                  : "quiet"
            }
            aria-label={item.name}
            busy={item.busy !== undefined}
            blocked={item.disabled}
            onClick={item.onSelect}
          >
            {item.busy === undefined ? item.label : ACTIONS[item.busy].busy}
          </Button>
        ) : (
          <a
            key={item.label}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "inline-flex h-control items-center gap-tight rounded-control border border-edge px-cell font-ui text-gray-12 text-row no-underline hover:bg-gray-3",
              "focus-visible:outline-2 focus-visible:outline-blue-9 focus-visible:outline-offset-2",
            )}
          >
            {item.label}
            <Icon of={ArrowUpRight} />
          </a>
        ),
      )}
    </>
  );
}
