// Server-state hook for the check that runs behind the remove confirmation:
// what would this removal destroy? Read-only despite the POST — the path goes
// in the body rather than a query string, like the filesystem browse route.
// Kept out of the mutation so the answer is on screen before the user commits,
// not after (#337).
import type { RemoveWarning } from "@maestro/core";
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";

// The wire shape, named by core's own vocabulary rather than a copy of it: the
// warnings must mean the same thing on both sides of the wire, so they get one
// owner (architecture.md — web imports types from core, never values).
export type RemovePreflight = { warning: RemoveWarning | null };

// Both arguments are null unless a confirmation is open on a repo target, so
// there is no "which repo?" question to answer while the query is off.
export function useRemovePreflight(
  skillName: string | null,
  repoPath: string | null,
) {
  return useQuery({
    queryKey: ["remove-preflight", repoPath, skillName] as const,
    queryFn: () =>
      requestJson<RemovePreflight>("/api/deploy/remove/preflight", {
        method: "POST",
        body: JSON.stringify({
          type: "skill",
          name: skillName,
          target: { kind: "repo", repoPath },
        }),
      }),
    // Only while a confirmation is open: nothing else on the screen asks what a
    // removal would cost.
    enabled: skillName !== null && repoPath !== null,
    // A fresh read every time the dialog opens. The whole point is the state of
    // the copy right now, and a cached answer from before an edit would be the
    // one lie this check exists to prevent.
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });
}
