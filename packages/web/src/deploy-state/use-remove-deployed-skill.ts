// Invalidates drift as well as deploy-state, or a badge would outlive the skill.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import {
  type DeployTarget,
  invalidateTarget,
} from "../inventory/use-deploy-skill";

export type RemoveRequest = {
  type: "skill";
  name: string;
  target: DeployTarget;
  // Proves the confirmation came from a real preflight, not a guessed path.
  confirmedReclaimToken?: string;
  // Without it the server refuses to delete a copy carrying local edits (#458).
  confirmedRemovalReceipt?: string;
};

// Optional fields: an older server answers 200 with the old shape (#383).
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
