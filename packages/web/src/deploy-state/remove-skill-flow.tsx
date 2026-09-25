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

// Read after a failed attempt, a clean target means that attempt landed: apm
// can remove a skill and still fail to prove it.
const alreadyGone = (error: unknown) =>
  error instanceof HttpError && error.code === "not-deployed";

type RemovalNews =
  | { kind: "failed"; notice: DeployStateNotice; outcome: RemoveOutcome | null }
  | { kind: "restated"; notice: DeployStateNotice };

const removalFailure = (error: unknown): RemovalNews => ({
  kind: "failed",
  notice: removeNotice(error),
  outcome: removalOutcome(error),
});

// One skill's removal from one target: its check, confirmation and run.
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
  // Required: a global target's tools must be present or the confirmation can't render.
  target: RemoveDialogTarget;
  /** The target as the screen names it, for the removal's toast. */
  targetName: string;
  onCancel: () => void;
  /** Called once a proven removal has closed the dialog. */
  onRemoved: () => void;
}) {
  // Held here, not read off the mutation: a retry clears the mutation's error
  // mid-attempt (#415). Message and outcome travel together (#416).
  const [news, setNews] = useState<RemovalNews | null>(null);
  const queryClient = useQueryClient();
  const remove = useRemoveDeployedSkill();
  // Global's location is apm's own, resolved server-side.
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
            confirmedReclaimToken: preflight.data?.reclaim?.token,
            confirmedRemovalReceipt: preflight.data?.receipt,
          },
          {
            onError: (error) => {
              if (news?.kind === "failed" && alreadyGone(error)) {
                onRemoved();
                return;
              }
              // The server acted on nothing; its answer replaces the one on screen whole, so no
              // confirm pairs one attempt's price with another's consent (#364).
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
            onSuccess: (data) => {
              const scope = data.removed.scope;
              showSuccess(
                removalAnnouncement({
                  name: data.removed.name,
                  version: data.removed.version,
                  // No scope in the response falls back to what the user consented to.
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
