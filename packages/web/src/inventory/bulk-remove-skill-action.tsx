import type { BulkRemoveTarget } from "@maestro/core";
import { useQueries } from "@tanstack/react-query";
import { useState } from "react";
import { refusedPreflightCode } from "../deploy-state/remove-preflight-view";
import { removePreflightQueryOptions } from "../deploy-state/use-remove-preflight";
import { Button } from "../ui/button";
import { BulkRemoveDialog } from "./bulk-remove-dialog";
import { useBulkRemove } from "./use-bulk-remove";
import type { DeployTarget } from "./use-deploy-skill";

// Never "nothing was removed": a lost answer does not prove the walk never
// ran, and the server removes one target at a time. The pane behind this is
// re-read either way, so the honest instruction is to go and look.
const OUTCOME_UNKNOWN =
  "Maestro lost its server's answer and cannot say what was removed. Close this and check the targets before trying again.";

// The pane's REMOVE section (#422). The caller decides whether there is a bulk
// to offer at all; this owns the button, and the run below owns everything the
// dialog needs.
export function BulkRemoveSkillAction({
  skillName,
  targets,
}: {
  skillName: string;
  targets: DeployTarget[];
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
  targets: DeployTarget[];
  onClose: () => void;
}) {
  const run = useBulkRemove();

  // Every target's own check, in parallel and never cached (#337 applied to a
  // whole list).
  const preflights = useQueries({
    queries: targets.map((target) =>
      removePreflightQueryOptions(skillName, target),
    ),
  });
  // An error answers too: a refusal takes its target out of the run, and a
  // failed check is the same "nobody knows" the single dialog lets through.
  const answeredCount = preflights.filter(
    (preflight) => preflight.isSuccess || preflight.isError,
  ).length;

  const confirm = () => {
    const entries: BulkRemoveTarget[] = targets.map((target, index) => {
      const preflight = preflights[index];
      const refused = refusedPreflightCode(preflight?.error);
      const token = preflight?.data?.reclaim?.token;
      return {
        target,
        // Only where the check minted one: the token authorises deleting the
        // exact leftover copies the user was shown (#390).
        ...(token === undefined ? {} : { confirmedReclaimToken: token }),
        ...(refused === null ? {} : { refused }),
      };
    });
    run.mutate({ name: skillName, targets: entries }, { onSuccess: onClose });
  };

  return (
    <BulkRemoveDialog
      skillName={skillName}
      targetCount={targets.length}
      answeredCount={answeredCount}
      isRemoving={run.isPending}
      error={run.isError ? OUTCOME_UNKNOWN : null}
      onCancel={onClose}
      onConfirm={confirm}
    />
  );
}
