// Retries at the release and Selection the server recorded; invalidates on
// success so the card stops offering the retry (#951).
import type { PendingOperation } from "@maestro/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import {
  type DeployTarget,
  invalidateTarget,
} from "../inventory/use-deploy-skill";

export type RetryRequest = {
  target: DeployTarget;
  confirmedCopyReceipt?: string;
};

type RetryResponse = { completed: PendingOperation };

export function useRetryOperation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RetryRequest) =>
      requestJson<RetryResponse>("/api/deploy/retry", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: (_data, request) =>
      invalidateTarget(queryClient, request.target),
  });
}
