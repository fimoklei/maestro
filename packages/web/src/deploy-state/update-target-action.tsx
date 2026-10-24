import { useState } from "react";
import { HttpError } from "../api/http";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { useScreenWrites, useWriteAction } from "../ui/use-write-action";
import { updateNotice, updatePreviewNotice } from "./notice-copy";
import { updateOutcomeRows } from "./update-outcome-report";
import { UpdateTargetDialog } from "./update-target-dialog";
import { useRetryOperation } from "./use-retry-operation";
import { useUpdatePreflight } from "./use-update-preflight";
import type { useUpdateTarget } from "./use-update-target";

// The caller owns the mutation, so the outcome outlives the control (#980).
export function UpdateTargetAction({
  targetName,
  updateLabel,
  target,
  update,
  add,
  onClose = () => {},
  defaultOpen = false,
}: {
  targetName: string;
  /** The label of the control that opened it, which its notices name. */
  updateLabel: string;
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
  const updateWrite = useWriteAction(update, {
    report: screen.report,
    action: "update",
    show: "row",
    name: () => null,
    failure: (error) =>
      updateOutcomeRows(error) === null
        ? updateNotice(error, updateLabel)
        : null,
  });
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
            updateWrite.phase === "running" || retry.isRetrying(target)
          }
          outcome={outcome}
          incomplete={outcome !== null && update.isError}
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
              ? updatePreviewNotice(preflight.error, updateLabel)
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
