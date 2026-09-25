// Sends only the two proofs the preview handed back (#954). Invalidates whatever
// the answer: a partial landing changed the target too.
import type { UpdateOutcomeRow } from "@maestro/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import {
  type DeployTarget,
  invalidateTarget,
} from "../inventory/use-deploy-skill";

export type UpdateRequest = {
  target: DeployTarget;
  token: string;
  // Another skill mints another token, so the server refuses an unpreviewed move (#955).
  add?: string;
  confirmedCopyReceipt?: string;
};

export type UpdateResponse = {
  release: string;
  outcome: UpdateOutcomeRow[];
};

export function useUpdateTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateRequest) =>
      requestJson<UpdateResponse>("/api/deploy/update", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSettled: (_data, _error, request) =>
      invalidateTarget(queryClient, request.target),
  });
}
