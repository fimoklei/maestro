// Runs the target's unfinished Deploy or Remove again, at the release and
// Selection the server recorded. On success the target's deploy-state and
// drift queries are invalidated, so the card stops offering the retry
// (frontend.md, #951).
import type { PendingOperation } from "@maestro/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import {
  type DeployTarget,
  invalidateTarget,
} from "../inventory/use-deploy-skill";

export type { PendingOperation };

export type RetryRequest = {
  target: DeployTarget;
  // The receipt this retry's own refusal minted: content that changed since
  // the interruption retires the old one (#952).
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
