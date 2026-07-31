// On success, invalidates the target's deploy-state and drift queries
// (frontend.md). Plan (which names to send) is the caller's; this only executes.
import type { BulkDeployReport } from "@maestro/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import { type DeployTarget, invalidateTarget } from "./use-deploy-skill";

export type BulkDeployRequest = {
  names: string[];
  target: DeployTarget;
};

export function useBulkDeploy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: BulkDeployRequest) =>
      requestJson<BulkDeployReport>("/api/deploy/bulk", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: (_data, request) =>
      invalidateTarget(queryClient, request.target),
  });
}
