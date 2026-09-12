import { useState } from "react";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { Button } from "../ui/button";
import { updateNotice, updatePreviewNotice } from "./notice-copy";
import { updateOutcomeRows } from "./update-outcome-lines";
import { UPDATE_TARGET } from "./update-target-copy";
import { UpdateTargetDialog } from "./update-target-dialog";
import { useRetryOperation } from "./use-retry-operation";
import { useUpdatePreflight } from "./use-update-preflight";
import type { useUpdateTarget } from "./use-update-target";

// The one control a behind target carries. Ghost, not amber: the deploy-state
// shows many cards that can be behind at once, and the design rules allows one
// amber fill per view — which the dialog's confirm is (ADR-0031, design.md).
export function UpdateTargetAction({
  targetName,
  target,
  update,
  offered = true,
}: {
  // The target's own label, as the card's header shows it.
  targetName: string;
  target: DeployTarget;
  // The card owns the mutation: while apm runs it reads `Updating to v0.3.4…`
  // and carries no control at all (spec story 27).
  update: ReturnType<typeof useUpdateTarget>;
  // False once the answer is in: an incomplete Update leaves the target with an
  // unfinished operation, which is converged before another Update is offered.
  // The dialog stays, so the reader keeps the ledger it just earned (#951).
  offered?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const preflight = useUpdatePreflight(
    target,
    open && update.data === undefined,
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
  };

  return (
    <>
      {offered ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={update.isPending}
          aria-label={`${UPDATE_TARGET} ${targetName}`}
          onClick={() => setOpen(true)}
        >
          {UPDATE_TARGET}
        </Button>
      ) : null}
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
