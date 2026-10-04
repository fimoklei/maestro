import type { RowData } from "@tanstack/react-table";
import { RefreshCw } from "lucide-react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { cn } from "./cn";
import { DataTable, type DataTableProps } from "./data-table";
import { DetailPaneSlot } from "./detail-pane";
import { EmptyState, type EmptyStateProps } from "./empty-state";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { Notice } from "./notice";
import { OptionMenu } from "./option-menu";
import { Panel } from "./panel";
import { StatusRegion } from "./status-region";
import type { TableScreenState } from "./use-table-screen";
import type { ViewOptions } from "./use-view-options";
import { ScreenReportContext } from "./use-write-action";

/** What a screen's pane spreads onto its `DetailPane`. */
type PaneFrame = {
  position: { index: number; count: number } | null;
  onPage: (step: -1 | 1) => void;
  onClose: () => void;
  getTriggerElement: () => HTMLElement | null;
};

export interface TableScreenProps<T extends RowData> {
  state: TableScreenState;
  /** The screen's count or state line, beside the title. */
  meta?: ReactNode;
  /** Band 1's primary action. */
  action?: ReactNode;
  rows: T[];
  columns: DataTableProps<T>["columns"];
  rowId: (row: T) => string;
  groups?: DataTableProps<T>["groups"];
  /** Band 2's left side, such as the screen's facts. */
  lead?: ReactNode;
  /** The freshness line, just before Re-read. */
  freshness?: ReactNode;
  /** The screen's own re-read is running: Re-read spins. */
  rereading: boolean;
  /** Skeleton rows on a first read, before any row is known. */
  firstReadRows: number;
  /** The screen's own narrowing, such as a search; an open pane survives it. */
  shown?: (row: T) => boolean;
  /** Filter and Display, from `useViewOptions`; they narrow, group and switch columns. */
  view?: ViewOptions<T>;
  /** Rows carry a checkbox for a bulk action. */
  selection?: DataTableProps<T>["selection"];
  /** Floats over the table's foot while rows are chosen. */
  selectionBar?: ReactNode;
  /** In place of rows when the narrowing leaves none. */
  noMatch?: string;
  /** Shown in place of the table once a read answered with no rows; none: nothing. */
  empty?: Omit<EmptyStateProps, "headingLevel">;
  /** The open row's pane, built on `DetailPane`; none: rows do not open. */
  pane?: (row: T, frame: PaneFrame) => ReactNode;
  /** A screen-specific failed-read notice, in place of the screen-wide one. */
  notice?: ReactNode;
  /** The screen's dialogs. */
  children?: ReactNode;
}

// The panel frame every table screen shares: bands, the one status region,
// the failed-read notice, the skeleton, the table or its empty state, and the
// detail pane with its paging and focus return.
export function TableScreen<T extends RowData>({
  state,
  meta,
  action,
  rows,
  columns,
  rowId,
  groups,
  lead,
  freshness,
  rereading,
  firstReadRows,
  shown,
  view,
  selection,
  selectionBar,
  noMatch,
  empty,
  pane,
  notice,
  children,
}: TableScreenProps<T>) {
  const [order, setOrder] = useState<string[]>([]);
  const gridRef = useRef<HTMLTableElement>(null);
  const getTriggerElement = useCallback(() => gridRef.current, []);
  const { openId, open } = state;

  const visible = rows.filter(
    (row) => (shown?.(row) ?? true) && (view?.shown(row) ?? true),
  );
  const openRow =
    pane === undefined
      ? null
      : (rows.find((row) => rowId(row) === openId) ?? null);
  const openIndex = openId === null ? -1 : order.indexOf(openId);
  const shownGroups = view === undefined ? groups : view.groups;
  // An unread group says so in its own line, so it is never drawn as empty.
  const groupSpeaks =
    shownGroups?.order?.some(
      (key) => (shownGroups.message?.(key) ?? null) !== null,
    ) ?? false;
  const showTable = state.skeleton || rows.length > 0 || groupSpeaks;

  return (
    <ScreenReportContext.Provider value={state.report}>
      <Panel
        title={state.name}
        meta={meta}
        action={action}
        band2={
          <>
            {lead}
            <div className="ml-auto flex flex-none items-center gap-inline">
              {freshness}
              <IconButton
                ref={state.rereadRef}
                label={`Re-read ${state.name}`}
                busy={rereading}
                onClick={state.reread}
              >
                <Icon of={RefreshCw} />
              </IconButton>
              {view?.menus.map((menu) => (
                <OptionMenu key={menu.label} {...menu} />
              ))}
            </div>
          </>
        }
      >
        {/* Mounted before any read, so its first announcement is heard. */}
        <StatusRegion>{state.announcement}</StatusRegion>
        {/* Side by side from 1100px; narrower, the pane floats over the table. */}
        <div className="relative flex h-[100cqh]">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {notice ?? (
              // Mounted before a failure is, so it is announced (#465); the
              // padding comes only with the notice.
              <div className={state.notice === null ? undefined : "p-panel"}>
                <Notice trigger="load" notice={state.notice} />
              </div>
            )}
            {showTable ? (
              <div
                aria-busy={state.reading || undefined}
                // Room under the last row while the selection bar floats over
                // it: bar height plus its offset (section + page + inline).
                className={cn(
                  "min-h-0 flex-1 overflow-auto",
                  selectionBar != null &&
                    "pb-[calc(var(--spacing-section)+var(--spacing-page)+var(--spacing-inline))]",
                )}
              >
                <DataTable
                  ref={gridRef}
                  label={`${state.name} table`}
                  columns={columns}
                  data={visible}
                  getRowId={rowId}
                  loading={state.skeleton}
                  skeletonRows={Math.min(rows.length || firstReadRows, 30)}
                  groups={shownGroups}
                  columnVisibility={
                    view === undefined
                      ? undefined
                      : Object.fromEntries(
                          [...view.hidden].map((id) => [id, false]),
                        )
                  }
                  empty={noMatch}
                  openRowId={openRow === null ? null : openId}
                  onRowOpen={
                    pane === undefined
                      ? undefined
                      : (row) => open(openId === rowId(row) ? null : rowId(row))
                  }
                  onRowOrderChange={setOrder}
                  selection={selection}
                />
              </div>
            ) : state.settled && empty !== undefined ? (
              <EmptyState headingLevel={2} {...empty} />
            ) : null}
            {selectionBar}
          </div>
          {openRow !== null && pane !== undefined ? (
            <DetailPaneSlot>
              {pane(openRow, {
                position:
                  openIndex === -1
                    ? null
                    : { index: openIndex, count: order.length },
                onPage: (step) => open(order[openIndex + step] ?? openId),
                onClose: () => open(null),
                getTriggerElement,
              })}
            </DetailPaneSlot>
          ) : null}
        </div>
        {children}
      </Panel>
    </ScreenReportContext.Provider>
  );
}
