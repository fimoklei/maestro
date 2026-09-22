// The row that opens a group in a DataTable (#993): the group's words, then
// how many rows it holds. Never a stop for the grid's cursor.
export function GroupHeader({
  label,
  count,
  columnCount,
}: {
  label: string;
  count: number;
  /** Every column of the table, so the header spans the row. */
  columnCount: number;
}) {
  return (
    <tr className="h-row border-gray-6 border-b bg-gray-2">
      <HeaderCell
        colSpan={columnCount}
        className="px-inline font-medium text-gray-12 text-meta"
      >
        {label} <span className="text-gray-11 tabular-nums">{count}</span>
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
