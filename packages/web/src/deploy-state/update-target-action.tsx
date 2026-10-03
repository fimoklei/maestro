import { useState } from "react";
import { HttpError } from "../api/http";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { useScreenReport, useWriteAction } from "../ui/use-write-action";
import { updateNotice, updatePreviewNotice } from "./notice-copy";
import { updateOutcomeRows } from "./update-outcome-report";
import { NO_GITHUB_ORIGIN } from "./update-target-copy";
import { UpdateTargetDialog } from "./update-target-dialog";
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
  const retry = useRetryOperation();
  const report = useScreenReport();
  // The dialog's Report states the outcome, failed or not.
  const updateWrite = useWriteAction(update, {
    report,
    action: "update",
    show: "row",
    name: () => null,
    failure: (error) =>
      updateOutcomeRows(error) === null ? updateNotice(error) : null,
  });
  const retryWrite = useWriteAction(retry, {
    report,
    action: "update",
    show: "row",
    name: () => null,
    failure: () => null,
  });
  const preview = preflight.data?.preview ?? null;
  const outcome = update.data?.outcome ?? updateOutcomeRows(update.error);

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
          preview={preview}
          isLoading={preflight.isPending}
          isRunning={
            updateWrite.phase === "running" || retryWrite.phase === "running"
          }
          outcome={outcome}
          incomplete={outcome !== null && update.isError}
          onRetry={() => retryWrite.run({ target })}
          blocked={
            preflight.error instanceof HttpError &&
            preflight.error.code === "inventory-origin-unavailable"
              ? NO_GITHUB_ORIGIN
              : null
          }
          error={
            preflight.isError
              ? updatePreviewNotice(preflight.error)
              : updateWrite.failure
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
