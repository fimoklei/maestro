import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useId } from "react";
import { cn } from "./cn";
import { FOCUS_RING_INSET } from "./focus-ring";
import { Icon } from "./icon";

/**
 * The last item of a pane's sub-list: rows folded under one 32px button,
 * its chevron in the mark slot, its label and count in the name column.
 */
export function SubListGroup({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  /** The folded rows, each a `SubListRow`. */
  children: ReactNode;
}) {
  const rowsId = useId();
  return (
    <li className="text-row">
      <button
        type="button"
        // The name holds open or closed in neither word: aria-expanded says it.
        aria-label={`${label}, ${count}`}
        aria-expanded={open}
        aria-controls={open ? rowsId : undefined}
        onClick={onToggle}
        className={cn(
          "flex h-row w-full cursor-pointer items-center gap-inline border-divider border-b text-left hover:bg-gray-3",
          FOCUS_RING_INSET,
        )}
      >
        <span
          aria-hidden="true"
          className="inline-flex w-6 flex-none justify-center text-gray-11"
        >
          <Icon of={open ? ChevronDown : ChevronRight} />
        </span>
        <span className="min-w-0 truncate text-gray-12">{label}</span>
        <span className="flex-none text-gray-11 tabular-nums">{count}</span>
      </button>
      {open ? (
        <ul id={rowsId} className="m-0 list-none p-0">
          {children}
        </ul>
      ) : null}
    </li>
  );
}
