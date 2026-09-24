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

// Update target's preview, run and outcome. The caller's control opens it; the
// caller owns the mutation, so the outcome outlives the control (story 27, #980).
export function UpdateTargetAction({
  targetName,
  target,
  update,
  add,
  onClose = () => {},
  defaultOpen = false,
}: {
  // The target's own label, as the card's header shows it.
  targetName: string;
  target: DeployTarget;
  // The skill the Inventory's entrance asks for beside the release move. Absent
  // from the card, which adds no skill of its own (#955).
  add?: string;
  // Owned by the caller, so the dialog keeps the run and its outcome.
  update: ReturnType<typeof useUpdateTarget>;
  // Run when the dialog closes, so an entrance that opened on a refusal can
  // drop it: the target the refusal described is gone (#955).
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
  // Present only once apm ran: on a refusal it rides with the code, on success
  // with the release the server proved (#416).
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
          // The record survives an incomplete update, so the way out is the
          // same retry the card offers (#951).
          incomplete={outcome !== null && update.isError}
          onRetry={() => retry.mutate({ target })}
          // The one refusal with no way through from this dialog: the Harness
          // clone's origin is fixed outside the cockpit (#960).
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
