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
  // The skill the Inventory's entrance asks for beside the release move. Part
  // of the key: a preview priced without it answers another question (#955).
  add?: string,
) {
  return {
    queryKey: [
      "update-preflight",
      targetQueryKey(target),
      add ?? null,
    ] as const,
    queryFn: () =>
      requestJson<UpdatePreflight>("/api/deploy/update/preflight", {
        method: "POST",
        body: JSON.stringify({
          target,
          ...(add === undefined ? {} : { add }),
        }),
      }),
    enabled,
    // Fresh every open: a cached price from before an edit or a release is the
    // one lie this preview exists to prevent.
    gcTime: 0,
    staleTime: 0,
    retry: false,
  };
}

export function useUpdatePreflight(
  target: DeployTarget,
  enabled: boolean,
  add?: string,
) {
  return useQuery(updatePreflightQueryOptions(target, enabled, add));
}
