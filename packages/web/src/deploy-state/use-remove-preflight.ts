// Read-only despite the POST: the path goes in the body. Kept out of the
// mutation so the answer is on screen before the user commits (#337).
import type { ReclaimConsent, RemoveCheck } from "@maestro/core";
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import {
  type DeployTarget,
  targetQueryKey,
} from "../inventory/use-deploy-skill";

export type RemovePreflight = {
  check: RemoveCheck;
  // One field, not two, so the screen can never show a path it has no token for.
  reclaim: ReclaimConsent | null;
  // Optional: an older server sends none, and the removal then refuses (#458).
  receipt?: string;
};

// Shared with the bulk path: one owner for the key and the never-cached contract.
export function removePreflightQueryOptions(
  skillName: string | null,
  target: DeployTarget,
) {
  return {
    queryKey: ["remove-preflight", targetQueryKey(target), skillName] as const,
    queryFn: () =>
      requestJson<RemovePreflight>("/api/deploy/remove/preflight", {
        method: "POST",
        body: JSON.stringify({ type: "skill", name: skillName, target }),
      }),
    enabled: skillName !== null,
    // Fresh every open: a cached answer from before an edit is the one lie
    // this check exists to prevent.
    gcTime: 0,
    staleTime: 0,
  };
}

export function useRemovePreflight(
  skillName: string | null,
  target: DeployTarget,
) {
  return useQuery(removePreflightQueryOptions(skillName, target));
}
