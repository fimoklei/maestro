import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutList } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { driftViewModel } from "../drift/drift-view-model";
import {
  DRIFT_KEY,
  driftQueryOptions,
  useGlobalDrift,
} from "../drift/use-drift";
import { type DeployTarget, sameTarget } from "../inventory/use-deploy-skill";
import { REGISTRY_KEY, useRegistry } from "../registry/use-registry";
import { freshnessLine } from "../ui/freshness";
import { Icon } from "../ui/icon";
import { type Copy, plainText } from "../ui/phrase";
import { PhraseText } from "../ui/phrase-text";
import { TableScreen } from "../ui/table-screen";
import { useNow } from "../ui/use-now";
import { useTableScreen } from "../ui/use-table-screen";
import { useViewOptions, type ViewOptions } from "../ui/use-view-options";
import {
  deployStateColumns,
  type TargetAction,
  type TargetTableRow,
} from "./deploy-state-columns";
import {
  deployStateNotRead,
  GLOBAL,
  NO_FILTER_MATCH,
  NO_TARGETS,
  NOTHING_DEPLOYED,
  REPOSITORIES,
  TARGET_LABEL,
  targetCount,
} from "./deploy-state-copy";
import { ImportLocalEditsAction } from "./import-local-edits-action";
import { TargetDetailPane } from "./target-detail-pane";
import { targetLinkItems, targetMenuItems } from "./target-menu";
import { targetPaneActions } from "./target-pane-actions";
import {
  emptyGroupLines,
  globalRows,
  repoRow,
  type TargetRow,
} from "./target-rows";
import { TARGET_STATUS_WORDS } from "./target-status";
import { UpdateTargetAction } from "./update-target-action";
import { updateLabel } from "./update-target-copy";
import { DEPLOY_STATE_KEY, deployStateQueryOptions } from "./use-deploy-state";
import { globalDeployStateQueryOptions } from "./use-global-deploy-state";
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

export function DeployStateView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const registry = useRegistry();
  // Only these rows re-read on tab return; every other reader of the same
  // queries opts out (#1037).
  const globalDeploy = useQuery({
    ...globalDeployStateQueryOptions(),
    refetchOnWindowFocus: true,
  });
  const globalDrift = useGlobalDrift();
  const repoPaths = (registry.data?.repos ?? []).map((repo) => repo.path);
  const repoDeploy = useQueries({
    queries: repoPaths.map((repo) => ({
      ...deployStateQueryOptions(repo),
      refetchOnWindowFocus: true,
    })),
  });
  const repoDrift = useQueries({ queries: repoPaths.map(driftQueryOptions) });
  const location = useLocation();

  const notRead = [
    ...(globalDeploy.isError ? (["global"] as const) : []),
    ...(registry.isError ? (["repos"] as const) : []),
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
    failure: notRead.length > 0 ? deployStateNotRead(notRead) : null,
    // Invalidated, not refetched by hand: that also drops drift's 5-minute
    // cache, so a pressed re-read is really fresh.
    onReread: () => {
      queryClient.invalidateQueries({ queryKey: REGISTRY_KEY });
      queryClient.invalidateQueries({ queryKey: DEPLOY_STATE_KEY });
      queryClient.invalidateQueries({ queryKey: DRIFT_KEY });
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

  const pendingOf = (target: DeployTarget) =>
    targets.find((row) => sameTarget(target, row.wire));
  const retry = useRetryOperation(screen.report, (target) => {
    const row = pendingOf(target);
    if (row?.pending === undefined) return null;
    return { operation: row.pending, name: row.updateName };
  });

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
    actions: targetMenuItems(row, retry.isRetrying(row.wire)),
    links: targetLinkItems(row),
    busy: retry.isRetrying(row.wire),
  }));
  const isColdStart =
    isRead &&
    globalDeploy.data.primitives.length === 0 &&
    globalDeploy.data.skipped.length === 0 &&
    repoPaths.length === 0;

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
      if (action === "retry") retry.run(row.wire);
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

  const view: ViewOptions<TargetTableRow> = useViewOptions(rows, {
    kind: {
      label: TARGET_LABEL,
      options: KIND_OPTIONS,
      of: (row) => row.group,
    },
    status: {
      words: TARGET_STATUS_WORDS,
      of: (row) => row.status?.word ?? null,
    },
    groupings: [
      {
        ...BY_TARGET,
        groups: {
          ...BY_TARGET.groups,
          // An empty group says what fills it; a failed read is the notice's,
          // a filtered-out group is No filter match's, and a cold start with no
          // target at all is the empty state's.
          message: (key: string) =>
            isColdStart && rows.length === 0
              ? null
              : blockLines(
                  emptyGroupLines(key, {
                    filtered: view.filterCount > 0,
                    global: globalDeploy.isSuccess
                      ? {
                          tools: globalDeploy.data.tools.length,
                          skipped: globalDeploy.data.skipped,
                        }
                      : null,
                    repositories: registry.isSuccess ? repoPaths.length : null,
                  }),
                ),
        },
      },
    ],
    initialGrouping: BY_TARGET.value,
    columns: COLUMN_OPTIONS,
    unavailable: "no targets yet",
  });

  const freshness = freshnessLine(
    {
      readAt: [
        globalDeploy.dataUpdatedAt,
        globalDrift.dataUpdatedAt,
        ...repoDeploy.map((query) => query.dataUpdatedAt),
        ...repoDrift.map((query) => query.dataUpdatedAt),
        // The server keeps a release comparison that later failed, so it can
        // be older than the read that carried it.
        ...targets.map((row) => row.head?.comparedAt),
      ],
      outcome: "untracked",
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
      rereading={screen.reading}
      firstReadRows={8}
      rows={rows}
      columns={columns}
      rowId={(row) => row.id}
      view={view}
      noMatch={NO_FILTER_MATCH}
      empty={{ ...NO_TARGETS, icon: <Icon of={LayoutList} /> }}
      pane={(row, frame) => {
        const placed = targetPaneActions(row, onAction);
        return (
          <TargetDetailPane
            row={row}
            {...frame}
            initialFocus={intent?.dialog ? null : undefined}
            onRetry={() => retry.run(row.wire)}
            isRetrying={retry.isRetrying(row.wire)}
            retryFailure={retry.failure(row.wire)}
            compared={freshness}
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

function blockLines(lines: Copy[] | null) {
  return lines === null
    ? null
    : lines.map((line) => (
        <span key={plainText(line)} className="block">
          <PhraseText copy={line} />
        </span>
      ));
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
          updateLabel={updateLabel(row)}
          target={row.wire}
          update={update}
          defaultOpen={openUpdate}
        />
      ) : null}
    </>
  );
}
