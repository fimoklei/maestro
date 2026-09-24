import { useQueryClient } from "@tanstack/react-query";
import { FolderGit2, RefreshCw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { targetLabel } from "../shell/target-label";
import { ACTIONS, doneSentence } from "../ui/busy-copy";
import { Button } from "../ui/button";
import { DataTable } from "../ui/data-table";
import { EmptyState } from "../ui/empty-state";
import { IconButton } from "../ui/icon-button";
import { Notice } from "../ui/notice";
import { Panel } from "../ui/panel";
import { showSuccess } from "../ui/toast";
import { useReadAnnouncement } from "../ui/use-read-announcement";
import { useReadSkeleton } from "../ui/use-read-skeleton";
import { useStatusRegion } from "../ui/use-status-region";
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
  REREAD_LABEL,
  SCREEN,
  STATUS_READINGS,
  TABLE_LABEL,
  unregisterNotice,
} from "./repositories-copy";
import { UnregisterDialog } from "./unregister-dialog";
import { useRegisterDialog } from "./use-register-dialog";
import { REGISTRY_KEY, useRegistry, useUnregisterRepo } from "./use-registry";

// The Repositories screen (#1009): which folders Maestro tracks, whether each
// is still there, and the controls that add or drop one.
export function RepositoriesView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const registry = useRegistry();
  const unregister = useUnregisterRepo();
  const skeleton = useReadSkeleton(registry.isFetching);
  const [unregistering, setUnregistering] = useState<RepositoryRow | null>(
    null,
  );
  const register = useRegisterDialog({
    onRegistered: (path, all) =>
      setWrite(doneSentence("register", targetLabel(path, all))),
  });

  const repos = registry.data?.repos ?? [];
  const paths = repos.map((repo) => repo.path);
  const rows: RepositoryRow[] = repos.map((repo) => ({
    path: repo.path,
    // Whole set drives each label so shared-prefix repos stay distinct (#211).
    name: targetLabel(repo.path, paths),
    status: STATUS_READINGS[repo.status],
  }));

  const reread = () => {
    skeleton.press();
    setWrite("");
    queryClient.invalidateQueries({ queryKey: REGISTRY_KEY });
  };

  const onAction = (row: RepositoryRow, action: RepositoryAction) => {
    if (action === "view") {
      navigate("/");
      return;
    }
    unregister.reset();
    setUnregistering(row);
  };
  const confirmUnregister = (row: RepositoryRow) => {
    setWrite(ACTIONS.unregister.busy);
    unregister.mutate(row.path, {
      onSuccess: () => {
        setUnregistering(null);
        // The toast is the end; the region does not say it twice.
        setWrite("");
        showSuccess(doneSentence("unregister", row.name));
      },
      onError: () => setWrite(""),
    });
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

  const readNotice = registry.isError
    ? { ...REPOS_NOT_READ, action: { label: REREAD_LABEL, onClick: reread } }
    : null;
  // A write's busy label, then its done sentence (design.md → Keyboard).
  const [region, setWrite] = useStatusRegion(
    useReadAnnouncement(SCREEN, skeleton.visible, readNotice),
  );
  const registerButton = (
    <Button variant="primary" onClick={register.openDialog}>
      {REGISTER_REPOSITORY}
    </Button>
  );

  return (
    <Panel
      title={SCREEN}
      action={registerButton}
      band2={
        <div className="ml-auto flex items-center gap-inline">
          <IconButton label={REREAD_LABEL} onClick={reread}>
            <RefreshCw
              aria-hidden="true"
              strokeWidth={1.5}
              className="size-4"
            />
          </IconButton>
        </div>
      }
    >
      <div role="status" className="sr-only">
        {register.registering ? ACTIONS.register.busy : region}
      </div>
      {/* Mounted before a failure is, so it is announced (#465); the
          padding comes only with the notice. */}
      <div className={readNotice === null ? undefined : "p-panel"}>
        <Notice trigger="load" notice={readNotice} />
      </div>
      {skeleton.visible || rows.length > 0 ? (
        <div aria-busy={registry.isFetching || undefined}>
          <DataTable
            label={TABLE_LABEL}
            columns={columns}
            data={rows}
            getRowId={(row) => row.path}
            loading={skeleton.visible}
            skeletonRows={Math.min(rows.length || 8, 30)}
          />
        </div>
      ) : null}
      {registry.isSuccess && rows.length === 0 && !skeleton.visible ? (
        <EmptyState
          headingLevel={2}
          title={EMPTY_TITLE}
          description={EMPTY_SENTENCE}
          icon={
            <FolderGit2
              aria-hidden="true"
              strokeWidth={1.5}
              className="size-4"
            />
          }
          action={
            <Button variant="quiet" onClick={register.openDialog}>
              {REGISTER_REPOSITORY}
            </Button>
          }
        />
      ) : null}
      {unregistering ? (
        <UnregisterDialog
          name={unregistering.name}
          busy={unregister.isPending}
          failure={
            unregister.isError ? unregisterNotice(unregister.error) : null
          }
          onConfirm={() => confirmUnregister(unregistering)}
          onClose={() => setUnregistering(null)}
        />
      ) : null}
      {register.open ? (
        <RegisterRepositoryDialog {...register.dialogProps} />
      ) : null}
    </Panel>
  );
}
