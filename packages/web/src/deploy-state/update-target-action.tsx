import { useState } from "react";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { Button } from "../ui/button";
import { updatePreviewNotice } from "./notice-copy";
import { UPDATE_TARGET } from "./update-target-copy";
import { UpdateTargetDialog } from "./update-target-dialog";
import { useUpdatePreflight } from "./use-update-preflight";

// The one control a behind target carries. Ghost, not amber: the deploy-state
// shows many cards that can be behind at once, and the design rules allows one
// amber fill per view — which the dialog's confirm is (ADR-0031, design.md).
export function UpdateTargetAction({
  targetName,
  target,
}: {
  // The target's own label, as the card's header shows it.
  targetName: string;
  target: DeployTarget;
}) {
  const [open, setOpen] = useState(false);
  const preflight = useUpdatePreflight(target, open);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`${UPDATE_TARGET} ${targetName}`}
        onClick={() => setOpen(true)}
      >
        {UPDATE_TARGET}
      </Button>
      {open ? (
        <UpdateTargetDialog
          targetName={targetName}
          preview={preflight.data?.preview ?? null}
          isLoading={preflight.isPending}
          error={
            preflight.isError ? updatePreviewNotice(preflight.error) : null
          }
          onCancel={() => setOpen(false)}
          // The confirm's effect is #954. This slice prices the update and
          // writes nothing, so nothing happens here yet.
          onConfirm={() => undefined}
        />
      ) : null}
    </>
  );
}
