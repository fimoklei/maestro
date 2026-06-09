// Mutation hook for deploying a skill into a registered repo. On success it
// invalidates that repo's deploy-state query, so the panel refetches and shows
// the skill at its tag without a manual reload (see .claude/rules/frontend.md).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";

export type DeployRequest = { type: "skill"; name: string; repoPath: string };

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
      queryClient.invalidateQueries({
        queryKey: ["deploy-state", request.repoPath],
      });
    },
  });
}
