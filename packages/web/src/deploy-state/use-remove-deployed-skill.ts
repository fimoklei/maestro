// Mutation hook for taking a deployed skill off a registered repo. On success it
// invalidates that repo's deploy-state and drift queries, so the row disappears
// through a refetch rather than a manual reload (see .claude/rules/frontend.md).
// Drift is a separate query: leaving it stale would keep a badge alive for a
// skill that is no longer there.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";

export type RemoveRequest = {
  type: "skill";
  name: string;
  // Repo only: global removal is not part of this slice, and the server refuses
  // any other target kind at the edge.
  target: { kind: "repo"; repoPath: string };
};

type RemoveResponse = { removed: { type: "skill"; name: string } };

export function useRemoveDeployedSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RemoveRequest) =>
      requestJson<RemoveResponse>("/api/deploy/remove", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: (_data, request) => {
      const repoPath = request.target.repoPath;
      queryClient.invalidateQueries({ queryKey: ["deploy-state", repoPath] });
      queryClient.invalidateQueries({ queryKey: ["drift", repoPath] });
    },
  });
}
