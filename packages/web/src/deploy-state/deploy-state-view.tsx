import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { driftViewModel } from "../drift/drift-view-model";
import { driftQueryOptions, useGlobalDrift } from "../drift/use-drift";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { REGISTRY_KEY, useRegistry } from "../registry/use-registry";
import { freshnessLine } from "../ui/freshness";
import { Notice } from "../ui/notice";
import { TableScreen } from "../ui/table-screen";
import { useNow } from "../ui/use-now";
import { useTableScreen } from "../ui/use-table-screen";
import { useViewOptions } from "../ui/use-view-options";
import {
  deployStateColumns,
  type TargetAction,
  type TargetTableRow,
} from "./deploy-state-columns";
import {
  GLOBAL,
  GLOBAL_NOT_READ,
  NO_FILTER_MATCH,
  NO_REPOSITORIES,
  NO_TOOL_DETECTED,
  NOTHING_DEPLOYED,
  REPOS_NOT_READ,
  REPOSITORIES,
  REREAD_LABEL,
  TARGET_LABEL,
  targetCount,
} from "./deploy-state-copy";
import { ImportLocalEditsAction } from "./import-local-edits-action";
import { skippedEntryKey, skippedEntryText } from "./skipped-entry-text";
import { TargetDetailPane } from "./target-detail-pane";
import { targetLinkItems, targetMenuItems } from "./target-menu";
import { targetPaneActions } from "./target-pane-actions";
import { globalRows, repoRow, type TargetRow } from "./target-rows";
import { TARGET_STATUS_WORDS } from "./target-status";
import { UpdateTargetAction } from "./update-target-action";
import { deployStateQueryOptions } from "./use-deploy-state";
import { useGlobalDeployState } from "./use-global-deploy-state";
import { useRetryOperation } from "./use-retry-operation";
import { useUpdateTarget } from "./use-update-target";

const KIND_OPTIONS = [
  { value: GLOBAL, label: GLOBAL },
  { value: REPOSITORIES, label: REPOSITORIES },
];
const BY_TARGET = {
  value: "kind",
  label: TARGET_LABEL,
  groups: {
    key: (row: TargetTableRow) => row.group,
    order: [GLOBAL, REPOSITORIES],
  },
};
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
  const location = useLocation();

  const failures = [
    ...(globalDeploy.isError ? [GLOBAL_NOT_READ] : []),
    ...(registry.isError ? [REPOS_NOT_READ] : []),
  ];
  const isRead = globalDeploy.isSuccess && registry.isSuccess;
  const screen = useTableScreen({
    name: "Deploy-state",
    // Drift is left out: its apm run is slow, so the rows never wait for it.
    reading:
      registry.isFetching ||
      globalDeploy.isFetching ||
      repoDeploy.some((query) => query.isFetching),
    settled: isRead,
    failure: failures[0] ?? null,
    // Invalidated, not refetched by hand: that also drops drift's 5-minute
    // cache, so a pressed re-read is really fresh.
    onReread: () => {
      queryClient.invalidateQueries({ queryKey: REGISTRY_KEY });
      queryClient.invalidateQueries({ queryKey: ["deploy-state"] });
      queryClient.invalidateQueries({ queryKey: ["drift"] });
    },
    openOnArrival:
      (location.state as { openTarget?: string } | null)?.openTarget ?? null,
  });

  const now = useNow();
  // The dialog a menu item asked the pane's foot to open.
  const [intent, setIntent] = useState<{
    dialog: TargetDialog;
    nonce: number;
  } | null>(null);
  // Opening a row any other way drops a menu item's dialog.
  const state = {
    ...screen,
    open: (id: string | null) => {
      setIntent(null);
      screen.open(id);
    },
  };
  const openFromMenu = useCallback(
    (id: string, dialog: TargetDialog) => {
      screen.open(id);
      setIntent((current) => ({ dialog, nonce: (current?.nonce ?? 0) + 1 }));
    },
    [screen.open],
  );

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
    actions: targetMenuItems(row, retrying(row.wire)),
    links: targetLinkItems(row),
  }));

  const onAction = useCallback(
    (row: TargetTableRow, action: TargetAction) => {
      if (action === "deploy") {
        navigate("/inventory");
        return;
      }
      openFromMenu(
        row.id,
        action === "update" || action === "import" ? action : null,
      );
      if (action === "retry") retry.mutate({ target: row.wire });
    },
    [navigate, openFromMenu, retry],
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

  const view = useViewOptions(rows, {
    kind: {
      label: TARGET_LABEL,
      options: KIND_OPTIONS,
      of: (row) => row.group,
    },
    status: {
      words: TARGET_STATUS_WORDS,
      of: (row) => row.status?.word ?? null,
    },
    groupings: [BY_TARGET],
    initialGrouping: BY_TARGET.value,
    columns: COLUMN_OPTIONS,
    unavailable: "no targets yet",
  });

  const noTools =
    globalDeploy.isSuccess && globalDeploy.data.tools.length === 0;
  const noRepos = registry.isSuccess && repoPaths.length === 0;
  const isColdStart =
    isRead &&
    globalDeploy.data.primitives.length === 0 &&
    globalDeploy.data.skipped.length === 0 &&
    repoPaths.length === 0;
  const freshness = freshnessLine(
    {
      readAt: [
        globalDeploy.dataUpdatedAt,
        globalDrift.dataUpdatedAt,
        ...repoDeploy.map((query) => query.dataUpdatedAt),
        ...repoDrift.map((query) => query.dataUpdatedAt),
      ],
      outcome: "untracked",
      reading: false,
    },
    now,
  );

  return (
    <TableScreen
      state={state}
      meta={
        isColdStart
          ? NOTHING_DEPLOYED
          : isRead
            ? targetCount(rows.length)
            : undefined
      }
      freshness={
        freshness === null ? null : (
          <span className="text-gray-11 text-meta">{freshness}</span>
        )
      }
      rows={rows}
      columns={columns}
      rowId={(row) => row.id}
      view={view}
      noMatch={NO_FILTER_MATCH}
      notice={
        failures.length > 0 || noTools || noRepos ? (
          <div className="flex flex-col gap-inline p-panel">
            {failures.map((failure) => (
              <Notice
                key={failure.label}
                trigger="load"
                notice={{
                  ...failure,
                  action: {
                    label: REREAD_LABEL,
                    onClick: screen.reread,
                  },
                }}
              />
            ))}
            {noTools ? (
              <>
                <Notice trigger="load" notice={NO_TOOL_DETECTED} />
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
            {noRepos ? (
              <p className="m-0 text-gray-11 text-meta">{NO_REPOSITORIES}</p>
            ) : null}
          </div>
        ) : undefined
      }
      pane={(row, frame) => {
        const placed = targetPaneActions(row, onAction);
        return (
          <TargetDetailPane
            row={row}
            {...frame}
            initialFocus={intent?.dialog ? null : undefined}
            onRetry={() => retry.mutate({ target: row.wire })}
            isRetrying={retrying(row.wire)}
            onReread={screen.reread}
            now={now}
            update={placed.update}
            foot={placed.foot}
            dialogs={
              <TargetActions
                key={`${row.id}:${intent?.nonce ?? 0}`}
                row={row}
                dialog={intent?.dialog ?? null}
              />
            }
          />
        );
      }}
    />
  );
}

type TargetDialog = "update" | "import" | null;

// The dialogs the pane's foot opens. It owns the Update mutation, so the
// dialog stays mounted through the run and keeps its outcome (#980).
function TargetActions({
  row,
  dialog,
}: {
  row: TargetRow;
  dialog: TargetDialog;
}) {
  const update = useUpdateTarget();
  const openUpdate = dialog === "update";
  const [importing, setImporting] = useState(dialog === "import");
  return (
    <>
      {importing ? (
        <ImportLocalEditsAction
          targetName={row.updateName}
          target={row.wire}
          only={null}
          onClose={() => setImporting(false)}
        />
      ) : null}
      {openUpdate ||
      update.isPending ||
      update.data !== undefined ||
      update.isError ? (
        <UpdateTargetAction
          targetName={row.updateName}
          target={row.wire}
          update={update}
          defaultOpen={openUpdate}
        />
      ) : null}
    </>
  );
}
