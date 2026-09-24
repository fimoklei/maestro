import { useQueries, useQueryClient } from "@tanstack/react-query";
import { ListFilter, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { driftViewModel } from "../drift/drift-view-model";
import { driftQueryOptions, useGlobalDrift } from "../drift/use-drift";
import { toggleStaged } from "../inventory/bulk-selection";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { REGISTRY_KEY, useRegistry } from "../registry/use-registry";
import { DataTable } from "../ui/data-table";
import { DetailPaneSlot } from "../ui/detail-pane";
import { FootActions, type FootItem } from "../ui/foot-actions";
import { IconButton } from "../ui/icon-button";
import { Notice, type NoticeContent } from "../ui/notice";
import { OptionMenu } from "../ui/option-menu";
import { Panel } from "../ui/panel";
import { useReadAnnouncement } from "../ui/use-read-announcement";
import { useReadSkeleton } from "../ui/use-read-skeleton";
import {
  deployStateColumns,
  type TargetAction,
  type TargetTableRow,
} from "./deploy-state-columns";
import {
  DISPLAY_LABEL,
  FILTER_LABEL,
  GLOBAL,
  GLOBAL_NOT_READ,
  NO_FILTER_MATCH,
  NO_REPOSITORIES,
  NO_TOOL_DETECTED,
  NOTHING_DEPLOYED,
  REPOS_NOT_READ,
  REPOSITORIES,
  REREAD_LABEL,
  TABLE_LABEL,
  targetCount,
} from "./deploy-state-copy";
import { freshnessLine } from "./freshness-line";
import { skippedEntryKey, skippedEntryText } from "./skipped-entry-text";
import { TargetDetailPane } from "./target-detail-pane";
import { targetMenuItems } from "./target-menu";
import { globalRows, repoRow, type TargetRow } from "./target-rows";
import { TARGET_STATUS_WORDS } from "./target-status";
import { UpdateTargetAction } from "./update-target-action";
import { UPDATE_TARGET } from "./update-target-copy";
import { deployStateQueryOptions } from "./use-deploy-state";
import { useGlobalDeployState } from "./use-global-deploy-state";
import { useRetryOperation } from "./use-retry-operation";
import { useUpdateTarget } from "./use-update-target";

// The landing screen (#993): every target in one table, grouped Global /
// Repositories, and a target's full reading in its detail pane.

type KindFilter = "all" | typeof GLOBAL | typeof REPOSITORIES;

const KIND_OPTIONS = [
  { value: "all", label: "All" },
  { value: GLOBAL, label: GLOBAL },
  { value: REPOSITORIES, label: REPOSITORIES },
];
const GROUP_OPTIONS = [
  { value: "kind", label: "Kind" },
  { value: "none", label: "None" },
];
const COLUMN_OPTIONS = [
  { value: "release", label: "Release" },
  { value: "status", label: "Status" },
  { value: "skills", label: "Skills" },
];

const sameTarget = (a: DeployTarget | undefined, b: DeployTarget) =>
  a !== undefined &&
  a.kind === b.kind &&
  (a.kind === "global" || (b.kind === "repo" && a.repoPath === b.repoPath));

export function DeployStateView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const registry = useRegistry();
  const globalDeploy = useGlobalDeployState();
  const globalDrift = useGlobalDrift();
  const repoPaths = (registry.data?.repos ?? []).map((repo) => repo.path);
  const repoDeploy = useQueries({
    queries: repoPaths.map(deployStateQueryOptions),
  });
  const repoDrift = useQueries({ queries: repoPaths.map(driftQueryOptions) });
  const retry = useRetryOperation();

  // Drift is left out: its apm run is slow, and a row reads without a Status
  // until it answers, so the rows never wait for it.
  const reading =
    registry.isFetching ||
    globalDeploy.isFetching ||
    repoDeploy.some((query) => query.isFetching);
  const skeleton = useReadSkeleton(reading);

  // Invalidated, not refetched by hand: that drops drift's 5-minute cache
  // too, so a pressed re-read is really fresh (#1033 story 26).
  const reread = () => {
    skeleton.press();
    queryClient.invalidateQueries({ queryKey: REGISTRY_KEY });
    queryClient.invalidateQueries({ queryKey: ["deploy-state"] });
    queryClient.invalidateQueries({ queryKey: ["drift"] });
  };

  const [kind, setKind] = useState<KindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [grouping, setGrouping] = useState<"kind" | "none">("kind");
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  // Another screen can send the reader to one target's row (#1065).
  const location = useLocation();
  const [selected, setSelected] = useState<string | null>(
    () =>
      (location.state as { openTarget?: string } | null)?.openTarget ?? null,
  );
  const [intent, setIntent] = useState<{
    update: boolean;
    nonce: number;
  } | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const gridRef = useRef<HTMLTableElement>(null);
  const getTriggerElement = useCallback(() => gridRef.current, []);

  const open = useCallback((id: string | null, update = false) => {
    setSelected(id);
    setIntent((current) =>
      id === null ? null : { update, nonce: (current?.nonce ?? 0) + 1 },
    );
  }, []);

  const retrying = (target: DeployTarget) =>
    retry.isPending && sameTarget(retry.variables?.target, target);

  const targets: TargetRow[] = [
    ...(globalDeploy.data
      ? globalRows(
          globalDeploy.data,
          driftViewModel(globalDrift),
          globalDeploy.isError,
        )
      : []),
    ...repoPaths.map((path, index) =>
      repoRow(
        path,
        repoPaths,
        repoDeploy[index] ?? { data: undefined, isError: false },
        driftViewModel(repoDrift[index] ?? { data: undefined, isError: false }),
      ),
    ),
  ];
  const rows: TargetTableRow[] = targets.map((row) => ({
    ...row,
    // Disabled while its retry runs, so the menu never starts a second one.
    actions: targetMenuItems(row, retrying(row.wire)),
  }));

  const onAction = useCallback(
    (row: TargetTableRow, action: TargetAction) => {
      if (action === "deploy") {
        navigate("/inventory");
        return;
      }
      open(row.id, action === "update");
      if (action === "retry") retry.mutate({ target: row.wire });
    },
    [navigate, open, retry],
  );
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const columns = useMemo(
    () =>
      deployStateColumns({
        onAction: (row, action) => onActionRef.current(row, action),
      }),
    [],
  );

  const filterCount = (kind === "all" ? 0 : 1) + statusFilter.size;
  const visible = rows.filter(
    (row) =>
      (kind === "all" || row.group === kind) &&
      (statusFilter.size === 0 ||
        (row.status !== null && statusFilter.has(row.status.word))),
  );

  const notices: NoticeContent[] = [
    ...(globalDeploy.isError
      ? [
          {
            ...GLOBAL_NOT_READ,
            action: { label: REREAD_LABEL, onClick: reread },
          },
        ]
      : []),
    ...(registry.isError
      ? [
          {
            ...REPOS_NOT_READ,
            action: { label: REREAD_LABEL, onClick: reread },
          },
        ]
      : []),
  ];
  const announcement = useReadAnnouncement(
    "Deploy-state",
    skeleton.visible,
    notices[0] ?? null,
  );
  const noTools =
    globalDeploy.isSuccess && globalDeploy.data.tools.length === 0;

  const isRead = globalDeploy.isSuccess && registry.isSuccess;
  const isColdStart =
    isRead &&
    globalDeploy.data.primitives.length === 0 &&
    globalDeploy.data.skipped.length === 0 &&
    repoPaths.length === 0;
  const freshness = freshnessLine(
    [
      globalDeploy.dataUpdatedAt,
      globalDrift.dataUpdatedAt,
      ...repoDeploy.map((query) => query.dataUpdatedAt),
      ...repoDrift.map((query) => query.dataUpdatedAt),
    ],
    new Date(),
  );

  const selectedRow = rows.find((row) => row.id === selected) ?? null;
  const openIndex = selected === null ? -1 : order.indexOf(selected);
  const showTable = skeleton.visible || rows.length > 0;
  const none = rows.length === 0 ? "no targets yet" : undefined;

  const band2 = (
    <div className="ml-auto flex items-center gap-inline">
      {freshness ? (
        <span className="text-gray-11 text-meta">{freshness}</span>
      ) : null}
      <IconButton label={REREAD_LABEL} onClick={reread}>
        <RefreshCw aria-hidden="true" strokeWidth={1.5} className="size-4" />
      </IconButton>
      <OptionMenu
        label={FILTER_LABEL}
        unavailable={none}
        count={filterCount}
        icon={
          <ListFilter aria-hidden="true" strokeWidth={1.5} className="size-4" />
        }
        sections={[
          {
            kind: "radio",
            label: "Kind",
            options: KIND_OPTIONS,
            value: kind,
            onChange: (value) => setKind(value as KindFilter),
          },
          {
            kind: "check",
            label: "Status",
            options: TARGET_STATUS_WORDS.map((word) => ({
              value: word,
              label: word,
            })),
            values: statusFilter,
            onToggle: (value) =>
              setStatusFilter((current) => toggleStaged(current, value)),
          },
        ]}
      />
      <OptionMenu
        label={DISPLAY_LABEL}
        unavailable={none}
        icon={
          <SlidersHorizontal
            aria-hidden="true"
            strokeWidth={1.5}
            className="size-4"
          />
        }
        sections={[
          {
            kind: "radio",
            label: "Group by",
            options: GROUP_OPTIONS,
            value: grouping,
            onChange: (value) => setGrouping(value as "kind" | "none"),
          },
          {
            kind: "check",
            label: "Columns",
            options: COLUMN_OPTIONS,
            values: new Set(
              COLUMN_OPTIONS.map((option) => option.value).filter(
                (value) => !hidden.has(value),
              ),
            ),
            onToggle: (value) =>
              setHidden((current) => toggleStaged(current, value)),
          },
        ]}
      />
    </div>
  );

  return (
    <Panel
      title="Deploy-state"
      meta={
        isColdStart
          ? NOTHING_DEPLOYED
          : isRead
            ? targetCount(rows.length)
            : undefined
      }
      band2={band2}
    >
      <div role="status" className="sr-only">
        {announcement}
      </div>
      <div className="relative flex h-[100cqh]">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Notices about the whole screen stay above the table (#991). */}
          {notices.length > 0 || noTools ? (
            <div className="flex flex-col gap-inline p-panel">
              {notices.map((notice) => (
                <Notice key={notice.label} trigger="load" notice={notice} />
              ))}
              {noTools ? (
                <>
                  <Notice trigger="load" notice={NO_TOOL_DETECTED} />
                  {/* No tool row carries them, so they stand here (J03). */}
                  {globalDeploy.data.skipped.map((entry, index) => (
                    <p
                      key={skippedEntryKey(entry, index)}
                      className="m-0 text-gray-11 text-meta"
                    >
                      {skippedEntryText(entry)}
                    </p>
                  ))}
                </>
              ) : null}
            </div>
          ) : null}
          {showTable ? (
            <div
              aria-busy={reading || undefined}
              className="min-h-0 flex-1 overflow-auto"
            >
              <DataTable
                ref={gridRef}
                label={TABLE_LABEL}
                columns={columns}
                data={visible}
                getRowId={(row) => row.id}
                loading={skeleton.visible}
                skeletonRows={Math.min(rows.length || 8, 30)}
                columnVisibility={Object.fromEntries(
                  [...hidden].map((id) => [id, false]),
                )}
                groups={
                  grouping === "kind"
                    ? { key: (row) => row.group, order: [GLOBAL, REPOSITORIES] }
                    : undefined
                }
                openRowId={selected}
                onRowOpen={(row) => open(selected === row.id ? null : row.id)}
                onRowOrderChange={setOrder}
                empty={NO_FILTER_MATCH}
              />
            </div>
          ) : null}
          {registry.isSuccess && repoPaths.length === 0 ? (
            <div className="p-panel">
              <p className="m-0 text-gray-11 text-meta">{NO_REPOSITORIES}</p>
            </div>
          ) : null}
        </div>
        {selectedRow ? (
          <DetailPaneSlot>
            <TargetDetailPane
              row={selectedRow}
              position={
                openIndex === -1
                  ? null
                  : { index: openIndex, count: order.length }
              }
              onPage={(step) => open(order[openIndex + step] ?? selected)}
              onClose={() => open(null)}
              getTriggerElement={getTriggerElement}
              // Update target opens a dialog that holds focus itself.
              initialFocus={intent?.update ? null : undefined}
              onRetry={() => retry.mutate({ target: selectedRow.wire })}
              isRetrying={retrying(selectedRow.wire)}
              onReread={reread}
              actions={
                <TargetActions
                  key={`${selectedRow.id}:${intent?.nonce ?? 0}`}
                  row={selectedRow}
                  openUpdate={intent?.update ?? false}
                  items={selectedRow.actions.map((item) => ({
                    label: item.label,
                    // Update target names the target it moves (spec story 32).
                    ...(item.action === "update" && !item.disabled
                      ? { name: `${UPDATE_TARGET} ${selectedRow.updateName}` }
                      : {}),
                    disabled: item.disabled,
                    onSelect: () => onAction(selectedRow, item.action),
                  }))}
                />
              }
            />
          </DetailPaneSlot>
        ) : null}
      </div>
    </Panel>
  );
}

// The pane's foot: the row's ⋮ items as buttons (#1065). It owns the Update
// mutation, so the dialog stays mounted through the run and keeps the outcome
// the reader just earned (#954, #980).
function TargetActions({
  row,
  openUpdate,
  items,
}: {
  row: TargetRow;
  openUpdate: boolean;
  items: FootItem[];
}) {
  const update = useUpdateTarget();
  return (
    <>
      <FootActions items={items} />
      {openUpdate ||
      update.isPending ||
      update.data !== undefined ||
      update.isError ? (
        <UpdateTargetAction
          targetName={row.updateName}
          target={row.wire}
          update={update}
          offered={false}
          defaultOpen={openUpdate}
        />
      ) : null}
    </>
  );
}
