import { useQueries, useQueryClient } from "@tanstack/react-query";
import { FolderGit2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { repoRowId } from "../deploy-state/target-rows";
import { deployStateQueryOptions } from "../deploy-state/use-deploy-state";
import { targetLabel } from "../shell/target-label";
import { Button } from "../ui/button";
import { REGISTER_REPOSITORY } from "../ui/control-labels";
import { Icon } from "../ui/icon";
import { named, phrase } from "../ui/phrase";
import { TableScreen } from "../ui/table-screen";
import { useTableScreen } from "../ui/use-table-screen";
import { useWriteAction } from "../ui/use-write-action";
import { RegisterRepositoryDialog } from "./register-repository-dialog";
import {
  type RepositoryAction,
  type RepositoryRow,
  repositoriesColumns,
} from "./repositories-columns";
import {
  EMPTY_SENTENCE,
  EMPTY_TITLE,
  REPOS_NOT_READ,
  SCREEN,
  STATUS_READINGS,
  unregisterNotice,
} from "./repositories-copy";
import { UnregisterDialog } from "./unregister-dialog";
import { useRegisterDialog } from "./use-register-dialog";
import { REGISTRY_KEY, useRegistry, useUnregisterRepo } from "./use-registry";

export function RepositoriesView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const registry = useRegistry();
  const unregister = useUnregisterRepo();
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
    onReread: () => {
      queryClient.invalidateQueries({ queryKey: REGISTRY_KEY });
      for (const path of paths)
        queryClient.invalidateQueries({
          queryKey: deployStateQueryOptions(path).queryKey,
        });
    },
    openOnArrival: null,
  });
  const { report } = screen;
  const [unregistering, setUnregistering] = useState<RepositoryRow | null>(
    null,
  );
  const register = useRegisterDialog({
    report,
    onAdded: screen.markAdded,
    registered: paths,
  });
  const unregisterWrite = useWriteAction(unregister, {
    report,
    action: "unregister",
    show: "toast",
    name: (_data, path) => phrase`${named(targetLabel(path, paths))}`,
    failure: unregisterNotice,
  });

  const rows: RepositoryRow[] = repos.map((repo, index) => ({
    path: repo.path,
    // Whole set drives each label so shared-prefix repos stay distinct (#211).
    name: targetLabel(repo.path, paths),
    status: STATUS_READINGS[repo.status],
    github: deployStates[index]?.data?.github,
  }));

  const onAction = (row: RepositoryRow, action: RepositoryAction) => {
    if (action === "view") {
      navigate("/", { state: { openTarget: repoRowId(row.path) } });
      return;
    }
    unregister.reset();
    setUnregistering(row);
  };
  const confirmUnregister = (row: RepositoryRow) =>
    unregisterWrite.run(row.path, { onSuccess: () => setUnregistering(null) });
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
        <Button variant="primary" onClick={register.openDialog}>
          {REGISTER_REPOSITORY}
        </Button>
      }
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
          <Button variant="quiet" onClick={register.openDialog}>
            {REGISTER_REPOSITORY}
          </Button>
        ),
      }}
    >
      {unregistering ? (
        <UnregisterDialog
          name={unregistering.name}
          phase={unregisterWrite.phase}
          failure={unregisterWrite.failure}
          onConfirm={() => confirmUnregister(unregistering)}
          onClose={() => setUnregistering(null)}
        />
      ) : null}
      {register.open ? (
        <RegisterRepositoryDialog {...register.dialogProps} />
      ) : null}
    </TableScreen>
  );
}
