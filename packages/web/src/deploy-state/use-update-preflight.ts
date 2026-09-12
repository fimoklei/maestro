// What would this update change? Read-only despite the POST — the target goes
// in the body, like the removal's own preflight. Kept out of any mutation, so
// the answer is on screen before the reader commits (#953).
import type { UpdatePreview } from "@maestro/core";
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import {
  type DeployTarget,
  targetQueryKey,
} from "../inventory/use-deploy-skill";

export type UpdatePreflight = { preview: UpdatePreview };

export function updatePreflightQueryOptions(
  target: DeployTarget,
  enabled: boolean,
) {
  return {
    queryKey: ["update-preflight", targetQueryKey(target)] as const,
    queryFn: () =>
      requestJson<UpdatePreflight>("/api/deploy/update/preflight", {
        method: "POST",
        body: JSON.stringify({ target }),
      }),
    enabled,
    // Fresh every open: a cached price from before an edit or a release is the
    // one lie this preview exists to prevent.
    gcTime: 0,
    staleTime: 0,
    retry: false,
  };
}

export function useUpdatePreflight(target: DeployTarget, enabled: boolean) {
  return useQuery(updatePreflightQueryOptions(target, enabled));
}
