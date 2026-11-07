import { useState } from "react";
import { HttpError } from "../api/http";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { useScreenWrites, useWriteAction } from "../ui/use-write-action";
import {
  globalUpdateNotice,
  updateNotice,
  updatePreviewNotice,
} from "./notice-copy";
import {
  type UpdateRunView,
  updateFolders,
  updateOutcomeRows,
} from "./update-outcome-report";
import { UpdateTargetDialog } from "./update-target-dialog";
import { useGlobalDeployState } from "./use-global-deploy-state";
import { useRetryOperation } from "./use-retry-operation";
import { useUpdatePreflight } from "./use-update-preflight";
import type { useUpdateTarget } from "./use-update-target";

// The caller owns the mutation, so the outcome outlives the control (#980).
export function UpdateTargetAction({
  targetName,
  target,
  update,
  add,
  onClose = () => {},
  defaultOpen = false,
}: {
  targetName: string;
  target: DeployTarget;
  add?: string;
  update: ReturnType<typeof useUpdateTarget>;
  onClose?: () => void;
  /** Opened by a control that asked for it by name. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const preflight = useUpdatePreflight(
    target,
    open && update.data === undefined,
    add,
  );
  const preview = preflight.data?.preview ?? null;
  // Writes to names the folders the Deploy-state read found, never a guess.
  const globalRead = useGlobalDeployState(open && target.kind === "global");
  const screen = useScreenWrites();
  // Both writes name nothing: the dialog's Report states the outcome, failed
  // or not.
  const retry = useRetryOperation(screen, () =>
    preview === null
      ? null
      : {
          operation: { kind: "update", release: preview.chosenRelease },
          subject: null,
        },
  );
  const global = target.kind === "global";
  const updateWrite = useWriteAction(update, {
    screen,
    action: "update",
    subject: () => null,
    failure: (error) =>
      updateOutcomeRows(error) !== null || updateFolders(error) !== null
        ? null
        : global
          ? globalUpdateNotice(error).notice
          : updateNotice(error),
  });
  // A completed Retry update reads the folders again; its read replaces the run's.
  const retried = retry.landed(target)?.outcome ?? null;
  const folders =
    retried ?? update.data?.folders ?? updateFolders(update.error);
  const rows = update.data?.outcome ?? updateOutcomeRows(update.error);
  const outcome: UpdateRunView | null =
    folders !== null
      ? { kind: "folders", folders }
      : rows !== null
        ? { kind: "skills", rows }
        : global && update.isError && globalUpdateNotice(update.error).unknown
          ? { kind: "unknown" }
          : null;

  const close = () => {
    setOpen(false);
    update.reset();
    retry.reset();
    onClose();
  };

  return (
    <>
      {open ? (
        <UpdateTargetDialog
          targetName={targetName}
          folders={
            target.kind === "global" ? (globalRead.data?.folders ?? []) : null
          }
          preview={preview}
          isLoading={preflight.isPending}
          isRunning={
            updateWrite.phase === "running" || retry.isRetrying(target)
          }
          outcome={outcome}
          incomplete={
            outcome !== null &&
            outcome.kind !== "unknown" &&
            update.isError &&
            retried === null
          }
          onRetry={() => retry.run(target)}
          // An origin-less Harness cannot attribute the target's release, so
          // no update can be priced (#960).
          blocked={
            preflight.error instanceof HttpError &&
            preflight.error.code === "inventory-origin-unavailable"
          }
          error={
            retry.failure(target) ??
            (preflight.isError
              ? updatePreviewNotice(preflight.error)
              : updateWrite.failure)
          }
          onCancel={close}
          onConfirm={() =>
            preview === null
              ? undefined
              : updateWrite.run({
                  target,
                  token: preview.token,
                  ...(add === undefined ? {} : { add }),
                  ...(preview.copyReceipt === null
                    ? {}
                    : { confirmedCopyReceipt: preview.copyReceipt }),
                })
          }
        />
      ) : null}
    </>
  );
}
