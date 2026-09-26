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
import {
  createContext,
  Fragment,
  type ReactNode,
  type Ref,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Checkbox } from "./checkbox";
import { cn } from "./cn";
import { GroupHeader } from "./group-header";
import { HOVER_TRANSITION } from "./hover-transition";
import { Skeleton } from "./skeleton";

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
  /** Accessible name of the header's checkbox, which picks every shown row. */
  allLabel?: string;
  /** Choose or drop several rows at once: select-all, or a Shift range. */
  onSetSelected?: (rows: T[], select: boolean) => void;
}

export interface DataTableGroups<T> {
  /** The group a row belongs to; also its header's words. */
  key: (row: T) => string;
  /** Groups in this order first; any other follows as it first appears. */
  order?: readonly string[];
  /** Words on the right of a group's header, e.g. what its rows wait for. */
  meta?: (key: string) => ReactNode;
  /** One line in place of rows for an empty `order` group; none: not drawn. */
  message?: (key: string) => ReactNode | null;
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
  /** Rows under a header per group, each header naming its count. */
  groups?: DataTableGroups<T>;
  /** The row ids in the order shown, after sorting and grouping. */
  onRowOrderChange?: (ids: string[]) => void;
  ref?: Ref<HTMLTableElement>;
}

const RowActiveContext = createContext(false);

export const useDataTableRowActive = () => useContext(RowActiveContext);

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
  groups,
  onRowOrderChange,
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
  const sortedRows = table.getRowModel().rows;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggleGroup = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  // Grouping reorders the sorted rows; the cursor walks this flat order.
  const blocks =
    groups === undefined
      ? undefined
      : groupKeys(
          [
            ...sortedRows.map((row) => groups.key(row.original)),
            ...(groups.order ?? []).filter(
              (key) => (groups.message?.(key) ?? null) !== null,
            ),
          ],
          groups.order,
        ).map((key) => {
          const all = sortedRows.filter(
            (row) => groups.key(row.original) === key,
          );
          // A folded group keeps its count; the cursor walks none of its rows.
          return { key, all, rows: collapsed.has(key) ? [] : all };
        });
  const rows =
    blocks === undefined ? sortedRows : blocks.flatMap((b) => b.rows);
  const leafColumns = table.getVisibleLeafColumns();
  const gridId = useId();
  const rowDomId = (index: number) => `${gridId}-row-${index}`;

  // One Tab stop: the arrows move this cursor, not focus.
  const [cursor, setCursor] = useState(0);
  const [gridFocused, setGridFocused] = useState(false);
  // A row opened from outside (a detail pane's pager) takes the cursor with it.
  const [cursorFor, setCursorFor] = useState<string | null>(null);
  if (cursorFor !== openRowId) {
    setCursorFor(openRowId);
    const opened = rows.findIndex((row) => row.id === openRowId);
    if (opened !== -1) setCursor(opened);
  }
  const active = Math.min(cursor, Math.max(rows.length - 1, 0));
  // The row last toggled; Shift picks the range from it to the next one.
  const [anchor, setAnchor] = useState<string | null>(null);
  const showRows = !loading && rows.length > 0;

  const order = rows.map((row) => row.id).join("\n");
  const reportOrder = useRef(onRowOrderChange);
  reportOrder.current = onRowOrderChange;
  useEffect(() => {
    reportOrder.current?.(order === "" ? [] : order.split("\n"));
  }, [order]);

  const chosenShown = selection
    ? rows.filter((row) => selection.selected.has(row.id)).length
    : 0;
  const allShownChosen = rows.length > 0 && chosenShown === rows.length;

  const toggleRow = (index: number, shift: boolean) => {
    const row = rows[index];
    if (row === undefined || selection === undefined) return;
    const from = rows.findIndex((each) => each.id === anchor);
    setAnchor(row.id);
    if (!shift || from === -1 || selection.onSetSelected === undefined) {
      selection.onToggle(row.original);
      return;
    }
    const [start, end] = from < index ? [from, index] : [index, from];
    selection.onSetSelected(
      rows.slice(start, end + 1).map((each) => each.original),
      !selection.selected.has(row.id),
    );
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTableElement>) => {
    if (!showRows) return;
    // React bubbles a portal's keys (a row's open menu) through its cell.
    if (!event.currentTarget.contains(event.target as Node)) return;
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
      case "x":
      case "X":
        if (row === undefined || selection === undefined) return;
        event.preventDefault();
        toggleRow(active, event.shiftKey);
        return;
      case "a":
        // Select all, as a grid's Control+A does (WAI-ARIA APG grid pattern).
        if (!(event.ctrlKey || event.metaKey) || !selection?.onSetSelected) {
          return;
        }
        event.preventDefault();
        selection.onSetSelected(
          rows.map((each) => each.original),
          !allShownChosen,
        );
        return;
      default:
        return;
    }
  };

  const columnCount = leafColumns.length + (selection ? 1 : 0);

  const renderRow = (row: (typeof rows)[number], index: number) => {
    const id = row.id;
    const isSelected = selection?.selected.has(id) ?? false;
    const isOpen = id === openRowId;
    return (
      <tr
        key={id}
        id={rowDomId(index)}
        aria-selected={selection ? isSelected : undefined}
        aria-current={isOpen || undefined}
        data-active={gridFocused && index === active ? true : undefined}
        // The press focuses the grid, so the cursor moves with it; on click
        // it would ring the previous row until release.
        onMouseDown={(event) => {
          if (event.currentTarget.contains(event.target as Node)) {
            setCursor(index);
          }
        }}
        onClick={(event) => {
          if (!event.currentTarget.contains(event.target as Node)) {
            return;
          }
          if ((event.target as HTMLElement).closest(INTERACTIVE)) {
            return;
          }
          onRowOpen?.(row.original);
        }}
        className={cn(
          "group/row h-row border-divider border-b",
          onRowOpen && "cursor-pointer",
          isOpen ? "bg-gray-5" : "hover:bg-gray-3",
          gridFocused &&
            index === active &&
            "outline-2 outline-blue-9 -outline-offset-2 outline",
          HOVER_TRANSITION,
        )}
      >
        <RowActiveContext value={gridFocused && index === active}>
          {selection ? (
            <GridCell className="px-inline">
              {/* The padding lifts the 16px box to the 24px pointer floor. */}
              {/* biome-ignore lint/a11y/noLabelWithoutControl: the Radix Checkbox is a button, and a label activates the button it wraps */}
              <label className="-m-1 flex w-fit cursor-pointer p-1">
                <Checkbox
                  tabIndex={-1}
                  checked={isSelected}
                  onClick={(event) => {
                    // Radix toggles on click; the row's state is
                    // the caller's, so the click is taken here.
                    event.preventDefault();
                    toggleRow(index, event.shiftKey);
                  }}
                  aria-label={selection.rowLabel(row.original)}
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
        </RowActiveContext>
      </tr>
    );
  };

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
          <tr key={group.id} className="h-row border-divider border-b">
            {selection ? (
              <th scope="col" className="w-8 px-inline">
                <span className="sr-only">{selection.label}</span>
                {selection.allLabel === undefined ? null : (
                  // biome-ignore lint/a11y/noLabelWithoutControl: the Radix Checkbox is a button, and a label activates the button it wraps
                  <label className="-m-1 flex w-fit cursor-pointer p-1">
                    <Checkbox
                      tabIndex={-1}
                      disabled={!showRows}
                      checked={
                        allShownChosen
                          ? true
                          : chosenShown > 0
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={() =>
                        selection.onSetSelected?.(
                          rows.map((row) => row.original),
                          !allShownChosen,
                        )
                      }
                      aria-label={selection.allLabel}
                    />
                  </label>
                )}
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
            <tr key={index} className="h-row border-divider border-b">
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
        ) : blocks !== undefined && blocks.length > 0 ? (
          blocks.map((block) => (
            <Fragment key={block.key}>
              <GroupHeader
                label={block.key}
                count={block.all.length === 0 ? undefined : block.all.length}
                meta={groups?.meta?.(block.key)}
                columnCount={columnCount}
                collapsed={
                  block.all.length === 0 ? undefined : collapsed.has(block.key)
                }
                onToggle={() => toggleGroup(block.key)}
              />
              {block.all.length === 0 ? (
                <tr className="h-row border-divider border-b">
                  <GridCell
                    colSpan={columnCount}
                    className="truncate px-inline text-gray-11"
                  >
                    {groups?.message?.(block.key)}
                  </GridCell>
                </tr>
              ) : (
                block.rows.map((row) => renderRow(row, rows.indexOf(row)))
              )}
            </Fragment>
          ))
        ) : rows.length === 0 ? (
          <tr className="h-row">
            <GridCell colSpan={columnCount} className="px-inline text-gray-11">
              {empty}
            </GridCell>
          </tr>
        ) : (
          rows.map((row, index) => renderRow(row, index))
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

function groupKeys(
  keys: readonly string[],
  order: readonly string[] = [],
): string[] {
  const present = new Set(keys);
  const first = order.filter((key) => present.has(key));
  return [...first, ...[...present].filter((key) => !first.includes(key))];
}
