// On success, invalidates the target's deploy-state and drift queries. Which
// names to send is the caller's plan.
import type { BulkDeployReport, HeldSkill } from "@maestro/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import {
  type DeployTarget,
  invalidateTarget,
} from "../inventory/use-deploy-skill";

type BulkDeployRequest = {
  names: string[];
  target: DeployTarget;
};

type DeployAgainRequest = {
  target: DeployTarget;
  held: HeldSkill[];
};

/** A held run's footer Deploy again: every held row with its own receipt. */
export function useDeployAgain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: DeployAgainRequest) =>
      requestJson<BulkDeployReport>("/api/deploy/again", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSettled: (_data, _error, request) =>
      invalidateTarget(queryClient, request.target),
  });
}

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
