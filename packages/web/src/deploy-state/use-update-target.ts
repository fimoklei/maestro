// Runs the update the preview priced. The release and the Selection stay the
// server's own reading; this sends only the two proofs the preview handed back
// (#954). The target's queries are invalidated whatever the answer — a partial
// landing changed the target too (frontend.md).
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
  // The skill the preview was priced with; another one mints another token, so
  // the server refuses rather than move a release nobody previewed (#955).
  add?: string;
  // The receipt the preview or this update's own refusal minted (#952).
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
