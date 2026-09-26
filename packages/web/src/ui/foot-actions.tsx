import { ArrowUpRight } from "lucide-react";
import { type ActionsMenuItem, orderedItems } from "./actions-menu";
import { Button } from "./button";
import { cn } from "./cn";

// The row's ⋮ items as buttons; the first enabled one is primary (#1065).
export type FootItem = ActionsMenuItem & {
  /** The accessible name where the label alone would not say what it acts on. */
  name?: string;
};

export function FootActions({ items }: { items: readonly FootItem[] }) {
  const ordered = orderedItems(items);
  const primary = ordered.findIndex(
    (item) => item.href === undefined && !item.disabled && !item.danger,
  );
  return (
    <>
      {ordered.map((item, index) =>
        item.href === undefined ? (
          <Button
            key={item.label}
            size="md"
            variant={
              item.danger ? "danger" : index === primary ? "primary" : "quiet"
            }
            aria-label={item.name}
            aria-disabled={item.disabled || undefined}
            // A blocked item reads as a disabled control, never as on offer.
            className="aria-disabled:border-edge aria-disabled:bg-gray-3 aria-disabled:text-gray-11"
            onClick={item.disabled ? undefined : item.onSelect}
          >
            {item.label}
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
            <ArrowUpRight
              aria-hidden="true"
              strokeWidth={1.5}
              className="size-4"
            />
          </a>
        ),
      )}
    </>
  );
}
