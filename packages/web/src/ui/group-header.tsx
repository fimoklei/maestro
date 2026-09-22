import type { ReactNode } from "react";

// The row that opens a group in a DataTable (#993): the group's words, then
// how many rows it holds, and on the right what the group waits for (#994).
// Never a stop for the grid's cursor.
export function GroupHeader({
  label,
  count,
  meta,
  columnCount,
}: {
  label: string;
  /** Left out where the group holds no rows, so a zero never reads as unread. */
  count?: number;
  meta?: ReactNode;
  /** Every column of the table, so the header spans the row. */
  columnCount: number;
}) {
  return (
    <tr className="h-row border-gray-6 border-b bg-gray-2">
      <HeaderCell
        colSpan={columnCount}
        className="px-inline font-medium text-gray-12 text-meta"
      >
        <span className="flex min-w-0 items-center gap-inline">
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
