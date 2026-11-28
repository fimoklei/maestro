import type { ReactNode } from "react";
import { cn } from "./cn";
import { CURRENT_ROW } from "./current-row";
import { GridCell } from "./grid-cell";

/** A read-only row under a table row: no cursor, no click, no menu. */
export type DataTableSubRow = {
  id: string;
  /** Content per column id; a column it names nothing for stays empty. */
  cells: Readonly<Record<string, ReactNode>>;
  /** Drawn in slate 11, for a part the parent does not act on. */
  muted?: boolean;
};

export function DataTableSubRows({
  rows,
  columnIds,
  withCheckbox,
  parentOpen,
}: {
  rows: readonly DataTableSubRow[];
  /** The shown columns, in order. */
  columnIds: readonly string[];
  /** The table has a checkbox column, which a sub-row leaves empty. */
  withCheckbox: boolean;
  /** Its parent's detail is open, so the sub-rows share its tint. */
  parentOpen: boolean;
}) {
  return rows.map((row) => (
    <tr
      key={row.id}
      className={cn(
        "h-row border-divider border-b",
        parentOpen && CURRENT_ROW,
        row.muted ? "text-gray-11" : "text-gray-12",
      )}
    >
      {withCheckbox ? <GridCell className="px-inline" /> : null}
      {spannedCells(row, columnIds).map(({ id, span }) => (
        <GridCell
          key={id}
          className="truncate px-inline"
          {...(span > 1 ? { colSpan: span } : {})}
        >
          {row.cells[id] ?? null}
        </GridCell>
      ))}
    </tr>
  ));
}

function spannedCells(
  row: DataTableSubRow,
  columnIds: readonly string[],
): { id: string; span: number }[] {
  const cells: { id: string; span: number }[] = [];
  for (const id of columnIds) {
    const last = cells.at(-1);
    if (last !== undefined && row.cells[id] == null) {
      last.span += 1;
    } else {
      cells.push({ id, span: 1 });
    }
  }
  return cells;
}
