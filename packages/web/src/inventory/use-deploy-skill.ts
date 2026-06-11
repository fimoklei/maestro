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

export type DeployRequest = {
  type: "skill";
  name: string;
  target: DeployTarget;
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
      // The query key matches the panel for this target: a repo's path, or the
      // fixed "global" key the global panel uses.
      const queryKey =
        request.target.kind === "repo"
          ? ["deploy-state", request.target.repoPath]
          : ["deploy-state", "global"];
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
