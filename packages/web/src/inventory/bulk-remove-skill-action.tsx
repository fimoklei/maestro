import type { BulkRemoveTarget } from "@maestro/core";
import { useQueries } from "@tanstack/react-query";
import { useState } from "react";
import {
  type RemovePreflightView,
  refusedPreflightCode,
  removePreflightView,
} from "../deploy-state/remove-preflight-view";
import { removePreflightQueryOptions } from "../deploy-state/use-remove-preflight";
import { Button } from "../ui/button";
import { BulkRemoveDialog } from "./bulk-remove-dialog";
import { bulkRemoveDialogView } from "./bulk-remove-dialog-view";
import type { BulkRemoveCandidate } from "./bulk-remove-targets";
import { useBulkRemove } from "./use-bulk-remove";

// Never "nothing was removed": a lost answer does not prove the walk never
// ran, and the server removes one target at a time. The pane behind this is
// re-read either way, so the honest instruction is to go and look.
const OUTCOME_UNKNOWN =
  "Maestro lost its server's answer and cannot say what was removed. Close this and check the targets before trying again.";

// useQueries returns one result per query, so this stands in for nothing. It
// is a running check rather than a clean copy, because a missing answer has
// proved nothing about the copy behind it (J04).
const STILL_CHECKING: RemovePreflightView = {
  kind: "offered",
  check: { kind: "unanswered", warning: "checking" },
  reclaim: [],
};

// The pane's REMOVE section (#422). The caller decides whether there is a bulk
// to offer at all; this owns the button, and the run below owns everything the
// dialog needs.
export function BulkRemoveSkillAction({
  skillName,
  targets,
}: {
  skillName: string;
  targets: BulkRemoveCandidate[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="quiet"
        size="sm"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        remove from all {targets.length} →
      </Button>
      {open ? (
        <BulkRemoveRun
          skillName={skillName}
          targets={targets}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

// Mounted only while the dialog is open, and that is the point: the checks
// unmount with it, so a reopen measures the copies again instead of handing
// out a confirm against the last open's answer. A disabled query keeps its
// observer, and an observed query keeps its data whatever gcTime says.
function BulkRemoveRun({
  skillName,
  targets,
  onClose,
}: {
  skillName: string;
  targets: BulkRemoveCandidate[];
  onClose: () => void;
}) {
  const run = useBulkRemove();

  // Every target's own check, in parallel and never cached (#337 applied to a
  // whole list). One view per target, read by both the screen and the run —
  // what the user was shown is what the run is told.
  const checks = useQueries({
    queries: targets.map((candidate) =>
      removePreflightQueryOptions(skillName, candidate.target),
    ),
    combine: (results) =>
      results.map((result) => ({
        view: removePreflightView({
          data: result.data,
          error: result.error,
          isPending: result.isPending,
          isError: result.isError,
        }),
        // Only where the check minted one: the token authorises deleting the
        // exact leftover copies the user was shown (#390).
        token: result.data?.reclaim?.token,
        // This target's own receipt, from this target's own check (#458).
        receipt: result.data?.receipt,
      })),
  });

  const view = bulkRemoveDialogView(
    targets.map((candidate, index) => ({
      label: candidate.label,
      version: candidate.version,
      // A short read cannot happen — useQueries returns one result per query
      // — but a missing answer is a running check, never a clean copy (J04).
      preflight: checks[index]?.view ?? STILL_CHECKING,
    })),
  );

  const confirm = () => {
    const entries: BulkRemoveTarget[] = targets.map((candidate, index) => {
      const check = checks[index];
      const refused = refusedPreflightCode(check?.view ?? STILL_CHECKING);
      const token = check?.token;
      const receipt = check?.receipt;
      return {
        target: candidate.target,
        ...(token === undefined ? {} : { confirmedReclaimToken: token }),
        // This target's own receipt, from this target's own check (#458).
        ...(receipt === undefined ? {} : { confirmedRemovalReceipt: receipt }),
        ...(refused === null ? {} : { refused }),
      };
    });
    run.mutate({ name: skillName, targets: entries }, { onSuccess: onClose });
  };

  return (
    <BulkRemoveDialog
      skillName={skillName}
      targetCount={targets.length}
      view={view}
      isRemoving={run.isPending}
      error={run.isError ? OUTCOME_UNKNOWN : null}
      onCancel={onClose}
      onConfirm={confirm}
    />
  );
}
