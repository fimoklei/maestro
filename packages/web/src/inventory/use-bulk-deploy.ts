// Mutation hook for bulk-deploying the staged skills to one target. On success
// it invalidates that target's deploy-state and drift queries, so the deployed
// column and drift chips refresh without a manual reload (frontend.md). The
// per-skill plan (which names to send) is decided by the caller; this hook only
// carries the execution and refreshes the affected panels.
import type { BulkDeployReport } from "@maestro/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import type { DeployTarget } from "./use-deploy-skill";

export type BulkDeployRequest = {
  names: string[];
  target: DeployTarget;
  force?: boolean;
};

export function useBulkDeploy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: BulkDeployRequest) =>
      requestJson<BulkDeployReport>("/api/deploy/bulk", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: (_data, request) => {
      const target =
        request.target.kind === "repo" ? request.target.repoPath : "global";
      queryClient.invalidateQueries({ queryKey: ["deploy-state", target] });
      queryClient.invalidateQueries({ queryKey: ["drift", target] });
    },
  });
}
