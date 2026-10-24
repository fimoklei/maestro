import type { RowData } from "@tanstack/react-table";
import { RefreshCw } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { type Band, BandRow } from "./band";
import { Button } from "./button";
import { cn } from "./cn";
import { rereadLabel } from "./control-labels";
import { DataTable, type DataTableProps, type RowGroups } from "./data-table";
import { DetailPaneSlot } from "./detail-pane";
import { EmptyState, type EmptyStateProps } from "./empty-state";
import type { CauseText } from "./gated-button";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { Notice } from "./notice";
import { OptionMenu } from "./option-menu";
import { Panel } from "./panel";
import { ScreenFocusContext } from "./screen-focus";
import { StatusRegion } from "./status-region";
import type { TableScreenState } from "./use-table-screen";
import type { ViewOptions } from "./use-view-options";
import { ScreenReportContext } from "./use-write-action";
import { CLEAR_FILTERS } from "./view-options-copy";

/** What a screen's pane spreads onto its `DetailPane`. */
type PaneFrame = {
  position: { index: number; count: number } | null;
  onPage: (step: -1 | 1) => void;
  onClose: () => void;
  getTriggerElement: () => HTMLElement | null;
};

type TableScreenBase<T extends RowData> = {
  state: TableScreenState;
  /** Band 1's primary action. */
  action?: ReactNode;
  rows: T[];
  columns: DataTableProps<T>["columns"];
  rowId: (row: T) => string;
  groups?: RowGroups<T>;
  /** Band 2's facts and Read, which narrow with the band. */
  band?: Band;
  /** The screen's own re-read is running: Re-read spins. */
  rereading: boolean;
  /** Skeleton rows on a first read, before any row is known. */
  firstReadRows: number;
  /** The screen's own narrowing, such as a search; an open pane survives it. */
  shown?: (row: T) => boolean;
  /** Rows carry a checkbox for a bulk action. */
  selection?: DataTableProps<T>["selection"];
  /** Follows the last row while rows are chosen, held in view as the table scrolls. */
  selectionBar?: ReactNode;
  /** In place of the table when the narrowing leaves no row; an active filter adds Clear filters. */
  noMatch?: Omit<EmptyStateProps, "headingLevel" | "headingId">;
  /** In place of the table once a read answered with no rows; none: nothing. */
  empty?: Omit<EmptyStateProps, "headingLevel" | "headingId">;
  /** The open row's pane, built on `DetailPane`; none: rows do not open. */
  pane?: (row: T, frame: PaneFrame) => ReactNode;
  /** The screen's dialogs. */
  children?: ReactNode;
};

// Filter and Display point at the frame's own failed-read notice, so a screen
// with its own notice has no view options.
export type TableScreenProps<T extends RowData> = TableScreenBase<T> &
  (
    | {
        /** Filter and Display, from `useViewOptions`; they narrow, group and switch columns. */
        view?: ViewOptions<T>;
        notice?: never;
      }
    | {
        view?: never;
        /** A screen-specific failed-read notice, in place of the screen-wide one. */
        notice: ReactNode;
      }
  );

// The panel frame every table screen shares: bands, the one status region,
// the failed-read notice, the skeleton, the table or its empty state, and the
// detail pane with its paging and focus return.
export function TableScreen<T extends RowData>({
  state,
  action,
  rows,
  columns,
  rowId,
  groups,
  band,
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
  const speaking =
    shownGroups?.order?.filter(
      (key) => (shownGroups.message?.(key) ?? null) !== null,
    ) ?? [];
  const showTable = state.skeleton || visible.length > 0 || speaking.length > 0;
  const ids = useId();
  const noticeId = `${ids}-notice`;
  const wordId = band?.wordId ?? `${ids}-word`;
  const emptyId = `${ids}-empty`;
  const lineId = (key: string) => `${ids}-line-${speaking.indexOf(key)}`;
  // One notice per band: a failed read replaces the empty state.
  const emptyState =
    !state.settled || state.notice !== null
      ? undefined
      : rows.length > 0
        ? view === undefined || view.filterCount === 0 || noMatch === undefined
          ? noMatch
          : {
              ...noMatch,
              action: (
                <Button variant="quiet" onClick={view.clearFilters}>
                  {CLEAR_FILTERS}
                </Button>
              ),
            }
        : empty;
  // Filter and Display point to what the frame drew in place of rows; while
  // skeleton rows stand in, it drew no cause, so they stay usable.
  const drawnCause = (): CauseText | undefined => {
    if (state.notice !== null) return { describedBy: noticeId };
    if (!state.settled) {
      return band === undefined ? undefined : { describedBy: wordId };
    }
    if (!showTable) {
      return emptyState === undefined ? undefined : { describedBy: emptyId };
    }
    if (state.skeleton || speaking.length === 0) return undefined;
    return { describedBy: speaking.map(lineId).join(" ") };
  };
  const viewCause = view?.blocked ? drawnCause() : undefined;

  // Focus whose row left goes to the row now in its place, which the grid's
  // cursor keeps, else Re-read; focus whose opener left goes to the pane first.
  const frameRef = useRef<HTMLDivElement>(null);
  const focusInTable = useRef(false);
  const toRow = useRef(() => {});
  toRow.current = () =>
    (showTable && visible.length > 0
      ? gridRef.current
      : state.rereadRef.current
    )?.focus();
  const refocus = useCallback(() => {
    const heading = frameRef.current?.querySelector<HTMLElement>(
      "[data-pane-heading]",
    );
    if (heading) heading.focus();
    else toRow.current();
  }, []);
  const shownIds = visible.map(rowId).join("\n");
  // An added row is selected and focused once a read shows it.
  const addedShown =
    state.addedId !== null &&
    visible.some((row) => rowId(row) === state.addedId);
  useEffect(() => {
    if (!addedShown) return;
    gridRef.current?.focus();
    state.markAdded(null);
  }, [addedShown, state.markAdded]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires when the shown rows change
  useEffect(() => {
    if (!focusInTable.current) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    focusInTable.current = false;
    toRow.current();
  }, [shownIds, showTable]);

  return (
    <ScreenReportContext.Provider value={state.report}>
      <ScreenFocusContext.Provider value={refocus}>
        <Panel
          title={state.name}
          action={action}
          band2={
            <BandRow
              band={band === undefined ? undefined : { ...band, wordId }}
            >
              <IconButton
                ref={state.rereadRef}
                label={rereadLabel(state.name)}
                busy={rereading}
                onClick={state.reread}
              >
                <Icon of={RefreshCw} />
              </IconButton>
              {view?.menus.map((menu) => (
                <OptionMenu
                  key={menu.label}
                  {...menu}
                  unavailable={viewCause}
                />
              ))}
            </BandRow>
          }
        >
          {/* Mounted before any read, so its first announcement is heard. */}
          <StatusRegion>{state.announcement}</StatusRegion>
          {/* Side by side; under 44rem an open pane takes the table's place. */}
          <div ref={frameRef} className="relative flex h-[100cqh]">
            <div
              className={cn(
                "relative flex min-h-0 min-w-0 flex-1 flex-col",
                openRow !== null && "@max-[44rem]:hidden",
              )}
            >
              {notice ?? (
                // Mounted before a failure is, so it is announced (#465); the
                // padding comes only with the notice.
                <div className={state.notice === null ? undefined : "p-panel"}>
                  <Notice id={noticeId} trigger="load" notice={state.notice} />
                </div>
              )}
              {showTable ? (
                // biome-ignore lint/a11y/noStaticElementInteractions: it only notes where focus stands; the grid inside is the control
                <div
                  aria-busy={state.reading || undefined}
                  onFocus={() => {
                    focusInTable.current = true;
                  }}
                  onBlur={(event) => {
                    // A removed element blurs toward nothing; that focus is lost.
                    if (event.relatedTarget !== null)
                      focusInTable.current = false;
                  }}
                  className="min-h-0 flex-1 overflow-auto"
                >
                  <DataTable
                    ref={gridRef}
                    label={`${state.name} table`}
                    columns={columns}
                    data={visible}
                    getRowId={rowId}
                    loading={state.skeleton}
                    skeletonRows={Math.min(rows.length || firstReadRows, 30)}
                    groups={
                      shownGroups === undefined
                        ? undefined
                        : {
                            ...shownGroups,
                            lineId,
                            collapsed: state.collapsed,
                            onToggle: state.toggleGroup,
                          }
                    }
                    columnVisibility={
                      view === undefined
                        ? undefined
                        : Object.fromEntries(
                            [...view.hidden].map((id) => [id, false]),
                          )
                    }
                    openRowId={openRow === null ? null : openId}
                    cursorRowId={state.addedId}
                    onRowOpen={
                      pane === undefined
                        ? undefined
                        : (row) =>
                            open(openId === rowId(row) ? null : rowId(row))
                    }
                    onRowOrderChange={setOrder}
                    selection={selection}
                  />
                  {/* In the scroller: under a short list it follows the last
                      row, under a long one it sticks to the panel's foot. */}
                  {selectionBar}
                </div>
              ) : (
                <>
                  {emptyState === undefined ? null : (
                    <EmptyState
                      headingLevel={2}
                      headingId={emptyId}
                      {...emptyState}
                    />
                  )}
                  {selectionBar}
                </>
              )}
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
      </ScreenFocusContext.Provider>
    </ScreenReportContext.Provider>
  );
}
