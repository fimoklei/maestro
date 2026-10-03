import { useQueryClient } from "@tanstack/react-query";
import { FolderGit2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { repoRowId } from "../deploy-state/target-rows";
import { targetLabel } from "../shell/target-label";
import { Button } from "../ui/button";
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
  REGISTER_REPOSITORY,
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
  const screen = useTableScreen({
    name: SCREEN,
    reading: registry.isFetching,
    settled: registry.isSuccess,
    failure: registry.isError ? REPOS_NOT_READ : null,
    onReread: () => queryClient.invalidateQueries({ queryKey: REGISTRY_KEY }),
    openOnArrival: null,
  });
  const { report } = screen;
  const [unregistering, setUnregistering] = useState<RepositoryRow | null>(
    null,
  );
  const repos = registry.data?.repos ?? [];
  const paths = repos.map((repo) => repo.path);
  const register = useRegisterDialog({ report });
  const unregisterWrite = useWriteAction(unregister, {
    report,
    action: "unregister",
    show: "toast",
    name: (_data, path) => targetLabel(path, paths),
    failure: unregisterNotice,
  });

  const rows: RepositoryRow[] = repos.map((repo) => ({
    path: repo.path,
    // Whole set drives each label so shared-prefix repos stay distinct (#211).
    name: targetLabel(repo.path, paths),
    status: STATUS_READINGS[repo.status],
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
      rows={rows}
      columns={columns}
      rowId={(row) => row.path}
      empty={{
        title: EMPTY_TITLE,
        description: EMPTY_SENTENCE,
        icon: (
          <FolderGit2 aria-hidden="true" strokeWidth={1.5} className="size-4" />
        ),
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
