import type { RemoveOutcome } from "@maestro/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { HttpError } from "../api/http";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { showSuccess } from "../ui/toast";
import { type DeployStateNotice, removeNotice } from "./notice-copy";
import { removalAnnouncement } from "./removal-announcement";
import { removalOutcome } from "./removal-outcome";
import type { RemoveDialogTarget } from "./remove-ledger-rows";
import { removePreflightView } from "./remove-preflight-view";
import { RemoveSkillDialog } from "./remove-skill-dialog";
import { restatedCost } from "./restated-cost";
import { useRemoveDeployedSkill } from "./use-remove-deployed-skill";
import {
  type RemovePreflight,
  removePreflightQueryOptions,
  useRemovePreflight,
} from "./use-remove-preflight";

// The target is provably clean. Read after an attempt that already failed, it
// says that attempt landed: apm can remove a skill and still fail to prove it,
// which takes the lockfile entry with it (apm-driver.md § Remove).
const alreadyGone = (error: unknown) =>
  error instanceof HttpError && error.code === "not-deployed";

// What one attempt came back with. One union rather than two states, because
// an attempt has one outcome: a removal that ran and failed, or one that ran
// nothing because its cost was never agreed to (#364).
type RemovalNews =
  // The removal's own notice for the code the server sent, and what the server
  // proved about each target afterwards.
  | { kind: "failed"; notice: DeployStateNotice; outcome: RemoveOutcome | null }
  // The notice for a removal the server did not start.
  | { kind: "restated"; notice: DeployStateNotice };

const removalFailure = (error: unknown): RemovalNews => ({
  kind: "failed",
  notice: removeNotice(error),
  outcome: removalOutcome(error),
});

// One skill's removal from one target: its check, its confirmation and its
// run. Mounted only while the dialog is open, from a Deploy-state skill row or
// an Inventory target row (#1065).
export function RemoveSkillFlow({
  skillName,
  version,
  target,
  targetName,
  onCancel,
  onRemoved,
}: {
  skillName: string;
  /** Null rather than a guess where the list no longer carries the skill. */
  version: string | null;
  // Required, not optional: a global target's tools must be present or the
  // confirmation can't render, and an optional prop could drop them (#338).
  target: RemoveDialogTarget;
  /** The target as the screen names it, for the removal's toast. */
  targetName: string;
  onCancel: () => void;
  /** Called once a proven removal has closed the dialog. */
  onRemoved: () => void;
}) {
  // Held here, not read off the mutation: a retry clears the mutation's error
  // mid-attempt (#415). Message and outcome travel together, so a ledger never
  // outlives the failure it reports on (#416).
  const [news, setNews] = useState<RemovalNews | null>(null);
  const queryClient = useQueryClient();
  const remove = useRemoveDeployedSkill();
  // Global's location is apm's own, resolved server-side (J07).
  const wireTarget: DeployTarget =
    target.kind === "repo" ? target : { kind: "global" };
  const preflight = useRemovePreflight(skillName, wireTarget);

  return (
    <RemoveSkillDialog
      skillName={skillName}
      version={version}
      target={target}
      isRemoving={remove.isPending}
      preflight={removePreflightView(preflight)}
      error={news?.kind === "failed" ? news.notice : null}
      restated={news?.kind === "restated" ? news.notice : null}
      outcome={news?.kind === "failed" ? news.outcome : null}
      onCancel={onCancel}
      onConfirm={() =>
        remove.mutate(
          {
            type: "skill",
            name: skillName,
            target: wireTarget,
            // The token that came with the paths the dialog just named, not
            // a client-rebuilt list a direct request could guess.
            confirmedReclaimToken: preflight.data?.reclaim?.token,
            // The answer this very dialog stated the cost from, so the
            // server can tell a confirmed removal from a claimed one.
            confirmedRemovalReceipt: preflight.data?.receipt,
          },
          {
            onError: (error) => {
              if (news?.kind === "failed" && alreadyGone(error)) {
                onRemoved();
                return;
              }
              // The server re-priced and acted on nothing. Its answer
              // replaces the one on screen whole, so no confirm pairs one
              // attempt's price with another's consent (#364).
              const cost = restatedCost(error);
              if (cost !== null) {
                queryClient.setQueryData(
                  removePreflightQueryOptions(skillName, wireTarget).queryKey,
                  (): RemovePreflight => ({
                    check: cost.check,
                    receipt: cost.receipt,
                    reclaim: cost.reclaim,
                  }),
                );
                setNews({ kind: "restated", notice: removeNotice(error) });
                return;
              }
              setNews(removalFailure(error));
            },
            // Only a proven removal closes the dialog — a failure keeps it
            // open with apm's reason.
            onSuccess: (data) => {
              const scope = data.removed.scope;
              // The row this names is gone by the time the toast is read,
              // which is why the success travels apart from the table.
              showSuccess(
                removalAnnouncement({
                  name: data.removed.name,
                  version: data.removed.version,
                  // No scope in the response falls back to what the user
                  // consented to, never a guess at a different target.
                  target:
                    scope?.kind === "global"
                      ? { kind: "global", tools: scope.tools }
                      : target.kind === "global"
                        ? target
                        : { kind: "repo", name: targetName },
                }),
              );
              onRemoved();
            },
          },
        )
      }
    />
  );
}
