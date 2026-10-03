import type { RowData } from "@tanstack/react-table";
import { RefreshCw } from "lucide-react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { DataTable, type DataTableProps } from "./data-table";
import { DetailPaneSlot } from "./detail-pane";
import { EmptyState, type EmptyStateProps } from "./empty-state";
import { IconButton } from "./icon-button";
import { Notice } from "./notice";
import { OptionMenu } from "./option-menu";
import { Panel } from "./panel";
import type { TableScreenState } from "./use-table-screen";
import type { ViewOptions } from "./use-view-options";

/** What a screen's pane spreads onto its `DetailPane`. */
export type PaneFrame = {
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
  /** The screen's own narrowing, such as a search; an open pane survives it. */
  shown?: (row: T) => boolean;
  /** Band 2's freshness line, before Re-read. */
  freshness?: string | null;
  /** Filter and Display, from `useViewOptions`; they narrow, group and switch columns. */
  view?: ViewOptions<T>;
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

const SKELETON_FALLBACK = 8;

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
  shown,
  freshness,
  view,
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
  const showTable = state.skeleton || rows.length > 0;

  return (
    <Panel
      title={state.name}
      meta={meta}
      action={action}
      band2={
        <div className="ml-auto flex items-center gap-inline">
          {freshness ? (
            <span className="text-gray-11 text-meta">{freshness}</span>
          ) : null}
          <IconButton label={`Re-read ${state.name}`} onClick={state.reread}>
            <RefreshCw
              aria-hidden="true"
              strokeWidth={1.5}
              className="size-4"
            />
          </IconButton>
          {view?.menus.map((menu) => (
            <OptionMenu key={menu.label} {...menu} />
          ))}
        </div>
      }
    >
      {/* Mounted before any read, so its first announcement is heard. */}
      <div role="status" className="sr-only">
        {state.announcement}
      </div>
      {/* Side by side from 1100px; narrower, the pane floats over the table. */}
      <div className="relative flex h-[100cqh]">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
              className="min-h-0 flex-1 overflow-auto"
            >
              <DataTable
                ref={gridRef}
                label={`${state.name} table`}
                columns={columns}
                data={visible}
                getRowId={rowId}
                loading={state.skeleton}
                skeletonRows={Math.min(rows.length || SKELETON_FALLBACK, 30)}
                groups={view === undefined ? groups : view.groups}
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
              />
            </div>
          ) : state.settled && empty !== undefined ? (
            <EmptyState headingLevel={2} {...empty} />
          ) : null}
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
  );
}
