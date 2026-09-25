import { useState } from "react";
import { HttpError } from "../api/http";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { updateNotice, updatePreviewNotice } from "./notice-copy";
import { updateOutcomeRows } from "./update-outcome-lines";
import { UPDATE_TARGET_NO_ORIGIN } from "./update-target-copy";
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
          isRunning={update.isPending || retry.isPending}
          outcome={outcome}
          incomplete={outcome !== null && update.isError}
          onRetry={() => retry.mutate({ target })}
          blocked={
            preflight.error instanceof HttpError &&
            preflight.error.code === "inventory-origin-unavailable"
              ? UPDATE_TARGET_NO_ORIGIN
              : null
          }
          error={
            preflight.isError
              ? updatePreviewNotice(preflight.error)
              : update.isError && outcome === null
                ? updateNotice(update.error)
                : null
          }
          onCancel={close}
          onConfirm={() =>
            preview === null
              ? undefined
              : update.mutate({
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
