import { EllipsisVertical } from "lucide-react";
import { ActionsMenu } from "../ui/actions-menu";
import { cn } from "../ui/cn";
import { rowActionsLabel } from "./inventory-copy";

export type RowAction = "deploy" | "update" | "remove";

// A row's ⋮ menu (#992). Shown on hover, on the row the keyboard is on, and
// always where nothing hovers; the grid keeps it out of the Tab order.
export function RowMenu<A extends string = RowAction>({
  name,
  items,
  onAction,
}: {
  name: string;
  items: readonly { action: A; label: string }[];
  onAction: (action: A) => void;
}) {
  return (
    <ActionsMenu
      label={rowActionsLabel(name)}
      // Every item opens the pane and moves focus into it.
      returnFocus={false}
      items={items.map((item) => ({
        label: item.label,
        onSelect: () => onAction(item.action),
      }))}
      trigger={
        <button
          type="button"
          tabIndex={-1}
          className={cn(
            // 24×24, the pointer floor (WCAG 2.2 SC 2.5.8).
            "inline-flex size-6 cursor-pointer items-center justify-center rounded-control text-gray-11 hover:bg-gray-4 hover:text-gray-12",
            "opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 group-data-[active]/row:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100",
            "focus-visible:outline-2 focus-visible:outline-blue-9 focus-visible:outline-offset-2",
          )}
        >
          <EllipsisVertical
            aria-hidden="true"
            strokeWidth={1.5}
            className="size-4"
          />
        </button>
      }
    />
  );
}
