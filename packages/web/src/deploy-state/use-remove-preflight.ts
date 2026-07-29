// Server-state hook for the check that runs behind the remove confirmation:
// what would this removal destroy? Read-only despite the POST — the path goes
// in the body rather than a query string, like the filesystem browse route.
// Kept out of the mutation so the answer is on screen before the user commits,
// not after (#337).
import type { ReclaimConsent, RemoveCheck } from "@maestro/core";
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import {
  type DeployTarget,
  targetQueryKey,
} from "../inventory/use-deploy-skill";

// The wire shape, named by core's own vocabulary rather than a copy of it: the
// warnings must mean the same thing on both sides of the wire, so they get one
// owner (architecture.md — web imports types from core, never values).
export type RemovePreflight = {
  // Shaped by the scope it ran against: one aggregate answer for a repo, one
  // per detected tool on the global scope (#414).
  check: RemoveCheck;
  // What a global removal's own reclaim would also delete, named by tool and
  // exact path, together with the server-issued token that authorizes deleting
  // exactly those paths. Null when there is nothing to reclaim, which is always
  // the case on a repo target. One field rather than two, so the screen can
  // never show a path it has no token for, and the confirm mutation can never
  // send a token for paths nobody was shown.
  reclaim: ReclaimConsent | null;
};

// The skill name is null unless a confirmation is open, so there is no "which
// skill?" question to answer while the query is off. The target is the row's
// own — the same one the removal itself will name, so the check runs against
// exactly the request it is about to send.
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
    // Only while a confirmation is open: nothing else on the screen asks what a
    // removal would cost.
    enabled: skillName !== null,
    // A fresh read every time the dialog opens. The whole point is the state of
    // the copy right now, and a cached answer from before an edit would be the
    // one lie this check exists to prevent.
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });
}
