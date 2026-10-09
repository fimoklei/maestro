import { EllipsisVertical } from "lucide-react";
import { ActionsMenu, type ActionsMenuItem } from "./actions-menu";
import { Spinner } from "./button";
import { cn } from "./cn";
import { FOCUS_RING } from "./focus-ring";
import { Icon } from "./icon";

/** A row item declares where focus goes: on, such as into the pane, or back to ⋮. */
export type RowMenuItem = ActionsMenuItem & { movesFocus: boolean };

// The one ⋮ of a table row or pane sub-list row (#1449). Its row carries
// `group/row`; ⋮ shows on hover, on the row the keyboard is on, while open and
// always where nothing hovers.
export function RowMenu({
  label,
  items,
  tabStop,
  busy,
}: {
  label: string;
  items: readonly RowMenuItem[];
  /** False inside a grid, which keeps one Tab stop. */
  tabStop: boolean;
  /** A write its row started is running: the spinner stands in for ⋮. */
  busy: boolean;
}) {
  return (
    <ActionsMenu
      label={label}
      items={items}
      trigger={
        <button
          type="button"
          tabIndex={tabStop ? undefined : -1}
          aria-busy={busy || undefined}
          className={cn(
            // 24×24, the pointer floor (WCAG 2.2 SC 2.5.8).
            "inline-flex size-6 cursor-pointer items-center justify-center rounded-control text-gray-11 hover:bg-gray-4 hover:text-gray-12",
            "opacity-0 group-hover/row:opacity-100 group-data-[active]/row:opacity-100 group-focus-within/row:opacity-100 data-[state=open]:opacity-100 aria-busy:opacity-100 [@media(hover:none)]:opacity-100",
            FOCUS_RING,
          )}
        >
          {busy ? <Spinner /> : <Icon of={EllipsisVertical} />}
        </button>
      }
    />
  );
}
