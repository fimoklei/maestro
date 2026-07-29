// What would this removal destroy? Read-only despite the POST — path goes in
// the body, like the filesystem browse route. Kept out of the mutation so the
// answer is on screen before the user commits (#337).
import type { ReclaimConsent, RemoveCheck } from "@maestro/core";
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import {
  type DeployTarget,
  targetQueryKey,
} from "../inventory/use-deploy-skill";

// Named by core's own vocabulary, not a copy (architecture.md — types only).
export type RemovePreflight = {
  // One aggregate answer for a repo, one per detected tool on global (#414).
  check: RemoveCheck;
  // Null when there's nothing to reclaim (always true on a repo target). One
  // field, not two, so the screen can never show a path it has no token for.
  reclaim: ReclaimConsent | null;
};

export function useRemovePreflight(
  skillName: string | null,
  target: DeployTarget,
) {
  return useQuery({
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
    retry: false,
  });
}
