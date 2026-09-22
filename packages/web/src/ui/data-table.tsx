// Adapted from Spectrum UI (Apache-2.0)
import {
  type ColumnDef,
  type ColumnHelper,
  type ColumnVisibilityState,
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  metaHelper,
  type RowData,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { type ReactNode, type Ref, useId, useState } from "react";
import { cn } from "./cn";
import { HOVER_TRANSITION } from "./hover-transition";
import { Skeleton } from "./skeleton";

// Every table screen's table (ADR-0033 §9); sorting and column visibility only.

export type DataTableColumnMeta = {
  /** Width and narrow-screen hiding for the column's header and cells. */
  className?: string;
  align?: "start" | "end";
};

export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
  columnVisibilityFeature,
  columnMeta: metaHelper<DataTableColumnMeta>(),
});

type Features = typeof dataTableFeatures;
// biome-ignore lint/suspicious/noExplicitAny: a column's value type differs per column, as TanStack's own ColumnDef arrays do
export type DataTableColumn<T extends RowData> = ColumnDef<Features, T, any>;

/** Build a screen's columns against the table's own feature set. */
export function createDataTableColumns<T extends RowData>(
  build: (helper: ColumnHelper<Features, T>) => DataTableColumn<T>[],
): DataTableColumn<T>[] {
  return build(createColumnHelper<Features, T>());
}

export interface DataTableSelection<T> {
  /** Accessible name of the checkbox column, e.g. "Select for bulk deploy". */
  label: string;
  /** Accessible name of one row's checkbox. */
  rowLabel: (row: T) => string;
  selected: ReadonlySet<string>;
  onToggle: (row: T) => void;
}

export interface DataTableProps<T extends RowData> {
  /** The grid's accessible name, e.g. "Inventory table". */
  label: string;
  columns: DataTableColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;
  selection?: DataTableSelection<T>;
  /** Enter on the active row, or a click anywhere in a row. */
  onRowOpen?: (row: T) => void;
  /** The row whose detail is open. */
  openRowId?: string | null;
  columnVisibility?: ColumnVisibilityState;
  /** Skeleton rows in the table's own shape replace the data. */
  loading?: boolean;
  skeletonRows?: number;
  /** Shown in place of rows when there are none. */
  empty?: ReactNode;
  ref?: Ref<HTMLTableElement>;
}

const INTERACTIVE = "a,button,input,select,textarea,label";

export function DataTable<T extends RowData>({
  label,
  columns,
  data,
  getRowId,
  selection,
  onRowOpen,
  openRowId = null,
  columnVisibility,
  loading = false,
  skeletonRows = 12,
  empty,
  ref,
}: DataTableProps<T>) {
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId: (row) => getRowId(row),
    enableSortingRemoval: false,
    sortDescFirst: false,
    ...(columnVisibility === undefined ? {} : { state: { columnVisibility } }),
  });
  const rows = table.getRowModel().rows;
  const leafColumns = table.getVisibleLeafColumns();
  const gridId = useId();
  const rowDomId = (index: number) => `${gridId}-row-${index}`;

  // One Tab stop for the whole grid; the arrows move this cursor, not focus,
  // so the controls inside a row never become Tab stops of their own.
  const [cursor, setCursor] = useState(0);
  const [gridFocused, setGridFocused] = useState(false);
  const active = Math.min(cursor, Math.max(rows.length - 1, 0));
  const showRows = !loading && rows.length > 0;

  const onKeyDown = (event: React.KeyboardEvent<HTMLTableElement>) => {
    if (!showRows) return;
    // A key typed into a row's own control belongs to that control.
    const target = event.target as HTMLElement;
    if (target !== event.currentTarget && target.closest(INTERACTIVE)) return;

    const move = (next: number) => {
      event.preventDefault();
      const clamped = Math.max(0, Math.min(rows.length - 1, next));
      setCursor(clamped);
      document
        .getElementById(rowDomId(clamped))
        ?.scrollIntoView?.({ block: "nearest" });
    };
    const row = rows[active]?.original;

    switch (event.key) {
      case "ArrowDown":
        return move(active + 1);
      case "ArrowUp":
        return move(active - 1);
      case "PageDown":
        return move(active + 10);
      case "PageUp":
        return move(active - 10);
      case "Home":
        return move(0);
      case "End":
        return move(rows.length - 1);
      case "Enter":
        if (row === undefined || onRowOpen === undefined) return;
        event.preventDefault();
        onRowOpen(row);
        return;
      case " ":
        if (row === undefined || selection === undefined) return;
        event.preventDefault();
        selection.onToggle(row);
        return;
      default:
        return;
    }
  };

  const columnCount = leafColumns.length + (selection ? 1 : 0);

  return (
    <table
      ref={ref}
      // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: WAI-ARIA's grid pattern builds on a table; the role gives it one Tab stop and arrow keys
      role="grid"
      aria-label={label}
      aria-multiselectable={selection ? true : undefined}
      aria-busy={loading || undefined}
      tabIndex={0}
      aria-activedescendant={
        gridFocused && showRows ? rowDomId(active) : undefined
      }
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        if (event.target === event.currentTarget) setGridFocused(true);
      }}
      onBlur={(event) => {
        if (event.target === event.currentTarget) setGridFocused(false);
      }}
      // The grid draws its own ring on the active row, not around itself.
      className="w-full table-fixed border-collapse text-row outline-none"
    >
      <thead className="sticky top-0 z-10 bg-gray-1">
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id} className="h-row border-gray-6 border-b">
            {selection ? (
              <th scope="col" className="w-8 px-inline">
                <span className="sr-only">{selection.label}</span>
              </th>
            ) : null}
            {group.headers.map((header) => {
              const meta = header.column.columnDef.meta;
              const sorted = header.column.getIsSorted();
              const canSort = header.column.getCanSort();
              return (
                <th
                  key={header.id}
                  scope="col"
                  aria-sort={
                    !canSort
                      ? undefined
                      : sorted === "asc"
                        ? "ascending"
                        : sorted === "desc"
                          ? "descending"
                          : "none"
                  }
                  className={cn(
                    "px-inline text-left font-normal text-gray-11 text-meta",
                    meta?.align === "end" && "text-right",
                    meta?.className,
                  )}
                >
                  {header.isPlaceholder ? null : canSort ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className={cn(
                        "inline-flex h-6 cursor-pointer items-center gap-tight rounded-control text-inherit hover:text-gray-12",
                        meta?.align === "end" && "flex-row-reverse",
                        HOVER_TRANSITION,
                      )}
                    >
                      <table.FlexRender header={header} />
                      <span aria-hidden="true">
                        {sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : ""}
                      </span>
                    </button>
                  ) : (
                    <table.FlexRender header={header} />
                  )}
                </th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {loading ? (
          Array.from({ length: skeletonRows }, (_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no identity but their place
            <tr key={index} className="h-row border-gray-6 border-b">
              {selection ? (
                <GridCell className="px-inline">
                  <Skeleton className="size-4" />
                </GridCell>
              ) : null}
              {leafColumns.map((column, columnIndex) => (
                <GridCell
                  key={column.id}
                  className={cn("px-inline", column.columnDef.meta?.className)}
                >
                  {/* Varied widths, as Spectrum's, so the rows read as rows. */}
                  <Skeleton
                    style={{
                      width: `${40 + ((index * 17 + columnIndex * 23) % 45)}%`,
                    }}
                  />
                </GridCell>
              ))}
            </tr>
          ))
        ) : rows.length === 0 ? (
          <tr className="h-row">
            <GridCell colSpan={columnCount} className="px-inline text-gray-11">
              {empty}
            </GridCell>
          </tr>
        ) : (
          rows.map((row, index) => {
            const id = row.id;
            const isSelected = selection?.selected.has(id) ?? false;
            const isOpen = id === openRowId;
            return (
              <tr
                key={id}
                id={rowDomId(index)}
                aria-selected={selection ? isSelected : undefined}
                aria-current={isOpen || undefined}
                onClick={(event) => {
                  setCursor(index);
                  if ((event.target as HTMLElement).closest(INTERACTIVE)) {
                    return;
                  }
                  onRowOpen?.(row.original);
                }}
                className={cn(
                  "h-row border-gray-6 border-b",
                  onRowOpen && "cursor-pointer",
                  isOpen ? "bg-gray-5" : "hover:bg-gray-3",
                  gridFocused &&
                    index === active &&
                    "outline-2 outline-blue-9 -outline-offset-2 outline",
                  HOVER_TRANSITION,
                )}
              >
                {selection ? (
                  <GridCell className="px-inline">
                    {/* The padded label lifts the 16px box to the 24px
                        pointer floor (WCAG 2.2 SC 2.5.8). */}
                    <label className="-m-1 flex w-fit cursor-pointer p-1">
                      <input
                        type="checkbox"
                        tabIndex={-1}
                        checked={isSelected}
                        onChange={() => selection.onToggle(row.original)}
                        aria-label={selection.rowLabel(row.original)}
                        className="size-4 cursor-pointer accent-gray-12"
                      />
                    </label>
                  </GridCell>
                ) : null}
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta;
                  return (
                    <GridCell
                      key={cell.id}
                      className={cn(
                        "truncate px-inline",
                        meta?.align === "end" && "text-right",
                        meta?.className,
                      )}
                    >
                      <table.FlexRender cell={cell} />
                    </GridCell>
                  );
                })}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

// jsdom maps a td to "cell" even inside a grid, so the role is stated here once.
function GridCell(props: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a cell of a role="grid" table is a gridcell (WAI-ARIA grid pattern)
    // biome-ignore lint/a11y/useFocusableInteractive: the grid holds focus and points at its active row with aria-activedescendant
    <td role="gridcell" {...props} />
  );
}
