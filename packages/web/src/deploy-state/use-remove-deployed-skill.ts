// Mutation hook for taking a deployed skill off a target — a registered repo or
// the user-scope global. On success it invalidates that target's deploy-state
// and drift queries, so the row disappears through a refetch rather than a
// manual reload (see .claude/rules/frontend.md). Drift is a separate query:
// leaving it stale would keep a badge alive for a skill that is no longer there.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import {
  type DeployTarget,
  targetQueryKey,
} from "../inventory/use-deploy-skill";

export type RemoveRequest = {
  type: "skill";
  name: string;
  // The same union the deploy path sends: a repo carries its path, global
  // carries none — its location is the server's to resolve (J07).
  target: DeployTarget;
  // The token this same target's preflight returned alongside its reclaim
  // preview. Proves to the server that the confirmation the user saw came
  // from an actual preflight call, rather than a path a direct request could
  // guess on its own.
  confirmedReclaimToken?: string;
};

// The server names the version it actually removed, read from the target's
// lockfile when it resolved the ref. The row's own version can be stale by the
// time the user confirms, so the outcome is reported from this, never from the
// screen (#383).
// Both fields describe what the removal actually did, not what the screen had
// in view when the user confirmed. They are typed optional because only the
// server guarantees them: an older or partly-deployed server answers 200 with
// the old shape, and the cockpit states that honestly instead of printing a
// placeholder over an irreversible action.
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
    onSuccess: (_data, request) => {
      const target = targetQueryKey(request.target);
      queryClient.invalidateQueries({ queryKey: ["deploy-state", target] });
      queryClient.invalidateQueries({ queryKey: ["drift", target] });
    },
  });
}
