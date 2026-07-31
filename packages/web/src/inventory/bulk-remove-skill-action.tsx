import type { BulkRemoveTarget } from "@maestro/core";
import { useQueries } from "@tanstack/react-query";
import { useState } from "react";
import { refusedPreflightCode } from "../deploy-state/remove-preflight-view";
import { removePreflightQueryOptions } from "../deploy-state/use-remove-preflight";
import { Button } from "../ui/button";
import { BulkRemoveDialog } from "./bulk-remove-dialog";
import { useBulkRemove } from "./use-bulk-remove";
import type { DeployTarget } from "./use-deploy-skill";

// The pane's REMOVE section (#422). The caller decides whether there is a bulk
// to offer at all; this owns the checks, the one request and the dialog.
const RUN_NEVER_STARTED =
  "Maestro could not reach its server, so nothing was removed anywhere. Try again.";

export function BulkRemoveSkillAction({
  skillName,
  targets,
}: {
  skillName: string;
  targets: DeployTarget[];
}) {
  const [open, setOpen] = useState(false);
  const run = useBulkRemove();

  // Every target's own check, in parallel and never cached, from the moment
  // the dialog opens (#337 applied to a whole list).
  const preflights = useQueries({
    queries: targets.map((target) => ({
      ...removePreflightQueryOptions(skillName, target),
      enabled: open,
    })),
  });
  // An error answers too: a refusal takes its target out of the run, and a
  // failed check is the same "nobody knows" the single dialog lets through.
  const answeredCount = preflights.filter(
    (preflight) => preflight.isSuccess || preflight.isError,
  ).length;

  const close = () => {
    setOpen(false);
    run.reset();
  };

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
    run.mutate({ name: skillName, targets: entries }, { onSuccess: close });
  };

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
        <BulkRemoveDialog
          skillName={skillName}
          targetCount={targets.length}
          answeredCount={answeredCount}
          isRemoving={run.isPending}
          error={run.isError ? RUN_NEVER_STARTED : null}
          onCancel={close}
          onConfirm={confirm}
        />
      ) : null}
    </>
  );
}
