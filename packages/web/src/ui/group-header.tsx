import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

// Never a stop for the grid's cursor.
export function GroupHeader({
  label,
  count,
  meta,
  columnCount,
  collapsed,
  onToggle,
}: {
  label: string;
  /** Left out where the group holds no rows, so a zero never reads as unread. */
  count?: number;
  meta?: ReactNode;
  /** Every column of the table, so the header spans the row. */
  columnCount: number;
  /** Undefined where the group has no rows to fold. */
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <tr className="h-row border-gray-6 border-b bg-gray-2">
      <HeaderCell
        colSpan={columnCount}
        className="px-inline font-medium text-gray-12 text-meta"
      >
        <span className="flex min-w-0 items-center gap-inline">
          {collapsed === undefined ? null : (
            // Out of the Tab order like a row's ⋮: the grid is one Tab stop.
            <button
              type="button"
              tabIndex={-1}
              aria-expanded={!collapsed}
              aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`}
              onClick={onToggle}
              // 24×24, the pointer floor (WCAG 2.2 SC 2.5.8).
              className="-ml-tight inline-flex size-6 flex-none cursor-pointer items-center justify-center rounded-control text-gray-11 hover:bg-gray-4 hover:text-gray-12"
            >
              <Chevron
                aria-hidden="true"
                strokeWidth={1.5}
                className="size-4"
              />
            </button>
          )}
          <span className="flex-none">
            {label}
            {count === undefined ? null : (
              <>
                {" "}
                <span className="text-gray-11 tabular-nums">{count}</span>
              </>
            )}
          </span>
          {meta ? (
            <span className="ml-auto min-w-0 truncate font-normal text-gray-11">
              {meta}
            </span>
          ) : null}
        </span>
      </HeaderCell>
    </tr>
  );
}

function HeaderCell(props: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a cell of a role="grid" table is a gridcell (WAI-ARIA grid pattern)
    // biome-ignore lint/a11y/useFocusableInteractive: the grid holds focus; a group header is never its active row
    <td role="gridcell" {...props} />
  );
}
