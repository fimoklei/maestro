// Mutation hook for deploying a skill to a target (a registered repo or the
// user-scope global). On success it invalidates that target's deploy-state
// query, so the matching panel refetches and shows the skill at its tag without
// a manual reload (see .claude/rules/frontend.md).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";

// Mirrors core's DeployTarget: a repo carries a path; global carries none.
export type DeployTarget =
  | { kind: "repo"; repoPath: string }
  | { kind: "global" };

// The target half of every per-target query key: a repo's path, or the fixed
// "global" literal. One owner, because deploy-state and drift are keyed by it on
// both the deploy and the remove path — a second spelling would leave one panel
// stale after the other refetched.
export function targetQueryKey(target: DeployTarget): string {
  return target.kind === "repo" ? target.repoPath : "global";
}

export type DeployRequest = {
  type: "skill";
  name: string;
  target: DeployTarget;
  // The cockpit-confirmed reinstall: skip the destination guard and reinstall at
  // the latest tag, discarding any local edits. Set only by the inline
  // "Reinstall fresh" confirm, never by a plain deploy/update (ADR-0006, #66).
  force?: boolean;
};

type DeployResponse = {
  deployed: { type: "skill"; name: string; version: string };
};

export function useDeploySkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: DeployRequest) =>
      requestJson<DeployResponse>("/api/deploy", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: (_data, request) => {
      // deploy-state shows the skill at its tag; drift is a separate query that
      // must refetch too, or the new skill keeps its stale "unknown" badge
      // (#48).
      const target = targetQueryKey(request.target);
      queryClient.invalidateQueries({ queryKey: ["deploy-state", target] });
      queryClient.invalidateQueries({ queryKey: ["drift", target] });
    },
  });
}
