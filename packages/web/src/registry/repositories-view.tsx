import { useQueries, useQueryClient } from "@tanstack/react-query";
import { FolderGit2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { isBehind, repoRowId } from "../deploy-state/target-rows";
import { deployStateQueryOptions } from "../deploy-state/use-deploy-state";
import { repoTargetName } from "../shell/target-name";
import { Button } from "../ui/button";
import { REGISTER_REPOSITORY } from "../ui/control-labels";
import { queryReading, readFreshness, targetReadings } from "../ui/freshness";
import { Icon } from "../ui/icon";
import { TableScreen } from "../ui/table-screen";
import { useTableScreen } from "../ui/use-table-screen";
import { RegisterRepositoryAction } from "./register-repository-action";
import {
  type RepositoryAction,
  type RepositoryRow,
  repositoriesColumns,
} from "./repositories-columns";
import {
  EMPTY_SENTENCE,
  EMPTY_TITLE,
  READY,
  REPOS_NOT_READ,
  REPOSITORIES_FACT,
  repositoriesCounts,
  SCREEN,
  STATUS_READINGS,
} from "./repositories-copy";
import { UnregisterRepositoryAction } from "./unregister-repository-action";
import { REGISTRY_KEY, useRegistry } from "./use-registry";

// Band 2 widths in rem, tuned in `pnpm smoke`: the labels go first, then the
// counts; the dot and Read never drop.
const LABELS_BELOW_REM = 46;
const COUNTS_BELOW_REM = 42;

export function RepositoriesView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const registry = useRegistry();
  const repos = registry.data?.repos ?? [];
  const paths = repos.map((repo) => repo.path);
  // The GitHub column reads what Deploy-state reads.
  const deployStates = useQueries({
    queries: paths.map(deployStateQueryOptions),
  });
  const screen = useTableScreen({
    name: SCREEN,
    reading:
      registry.isFetching || deployStates.some((read) => read.isFetching),
    settled: registry.isSuccess,
    failure: registry.isError ? REPOS_NOT_READ : null,
    readFailed: registry.isError,
    onReread: () => {
      queryClient.invalidateQueries({ queryKey: REGISTRY_KEY });
      for (const path of paths)
        queryClient.invalidateQueries({
          queryKey: deployStateQueryOptions(path).queryKey,
        });
    },
    openOnArrival: null,
  });
  const [unregistering, setUnregistering] = useState<RepositoryRow | null>(
    null,
  );
  const [registering, setRegistering] = useState(false);

  const rows: RepositoryRow[] = repos.map((repo, index) => ({
    path: repo.path,
    // Whole set drives each label so shared-prefix repos stay distinct (#211).
    name: repoTargetName(repo.path, paths),
    status: STATUS_READINGS[repo.status],
    github: deployStates[index]?.data?.github,
  }));

  const behind = deployStates.filter((read) =>
    isBehind(read.data?.releaseHead, read.data?.pendingOperation),
  ).length;

  const onAction = (row: RepositoryRow, action: RepositoryAction) => {
    if (action === "view") {
      navigate("/", { state: { openTarget: repoRowId(row.path) } });
      return;
    }
    setUnregistering(row);
  };
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const columns = useMemo(
    () =>
      repositoriesColumns({
        onAction: (row, action) => onActionRef.current(row, action),
      }),
    [],
  );

  return (
    <TableScreen
      state={screen}
      action={
        <Button variant="primary" onClick={() => setRegistering(true)}>
          {REGISTER_REPOSITORY}
        </Button>
      }
      band={{
        facts:
          registry.data === undefined
            ? []
            : [
                {
                  label: REPOSITORIES_FACT,
                  icon: <Icon of={FolderGit2} />,
                  value: String(repos.length),
                  machine: false,
                },
              ],
        summary: {
          freshness: readFreshness([
            queryReading(registry),
            ...targetReadings(deployStates),
          ]),
          healthy: READY,
          counts: repositoriesCounts(
            repos.map((repo) => repo.status),
            behind,
          ),
        },
        labelsBelowRem: LABELS_BELOW_REM,
        countsBelowRem: COUNTS_BELOW_REM,
      }}
      rereading={screen.reading}
      firstReadRows={8}
      rows={rows}
      columns={columns}
      rowId={(row) => row.path}
      empty={{
        title: EMPTY_TITLE,
        description: EMPTY_SENTENCE,
        icon: <Icon of={FolderGit2} />,
        action: (
          <Button variant="quiet" onClick={() => setRegistering(true)}>
            {REGISTER_REPOSITORY}
          </Button>
        ),
      }}
    >
      {unregistering ? (
        <UnregisterRepositoryAction
          row={unregistering}
          paths={paths}
          screen={screen}
          onClose={() => setUnregistering(null)}
        />
      ) : null}
      {registering ? (
        <RegisterRepositoryAction
          screen={screen}
          onAdded={screen.markAdded}
          onClose={() => setRegistering(false)}
          registered={paths}
        />
      ) : null}
    </TableScreen>
  );
}
