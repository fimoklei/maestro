// On success, invalidates the target's deploy-state and drift queries
// (frontend.md) — drift is separate, or a badge would outlive the skill.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import {
  type DeployTarget,
  invalidateTarget,
} from "../inventory/use-deploy-skill";

export type RemoveRequest = {
  type: "skill";
  name: string;
  // Same union the deploy path sends — global's location is server-resolved (J07).
  target: DeployTarget;
  // Proves the confirmation the user saw came from an actual preflight call,
  // not a path a direct request could guess.
  confirmedReclaimToken?: string;
  // The same proof for the removal itself: without it the server refuses to
  // delete a copy carrying local edits (#458).
  confirmedRemovalReceipt?: string;
};

// The outcome is reported from the server's answer, never the screen's own
// (possibly stale) version (#383). Optional: an older server answers 200 with
// the old shape, and the cockpit states that honestly.
type RemoveResponse = {
  removed: {
    type: "skill";
    name: string;
    version?: string;
    scope?: { kind: "repo" } | { kind: "global"; tools: string[] };
  };
};

export function useRemoveDeployedSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RemoveRequest) =>
      requestJson<RemoveResponse>("/api/deploy/remove", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: (_data, request) =>
      invalidateTarget(queryClient, request.target),
  });
}
