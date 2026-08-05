// Server-state for the Harness home base (frontend.md — no fetch-in-effect).
// Two operations: a plain read that paints the local picture at once, and a
// refresh that reaches the remote and replaces it.

import type {
  HarnessFreshness,
  HarnessMovement,
  HarnessReleaseState,
  HarnessState,
  PendingSkillMovement,
  ReleasePlan,
  SemverStep,
  SkillMovementKind,
  StructuralFinding,
  StructuralProblem,
} from "@maestro/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";

// Re-exported rather than copied, so the browser's shape cannot drift from the
// one core defines (architecture.md).
export type {
  HarnessFreshness,
  HarnessMovement,
  HarnessReleaseState,
  HarnessState,
  PendingSkillMovement,
  ReleasePlan,
  SemverStep,
  SkillMovementKind,
  StructuralFinding,
  StructuralProblem,
};

const HARNESS_KEY = ["harness", "state"] as const;
const RELEASE_PLAN_KEY = ["harness", "release-plan"] as const;

export function useHarness() {
  return useQuery({
    queryKey: HARNESS_KEY,
    queryFn: () => requestJson<HarnessState>("/api/harness"),
  });
}

// The release plan for the dialog, fetched only while it is open. A plan is a
// snapshot of one moment's delta, and a stale one would price a release the
// remote has already moved past.
export function useReleasePlan(enabled: boolean) {
  return useQuery({
    queryKey: RELEASE_PLAN_KEY,
    queryFn: () => requestJson<ReleasePlan>("/api/harness/release-plan"),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

// Closing the dialog must discard the plan, not park it. `gcTime: 0` collects
// nothing while the hook stays mounted, so reopening would render the previous
// revision and version until the new request lands (#519).
export function useDiscardReleasePlan() {
  const queryClient = useQueryClient();
  return () => queryClient.removeQueries({ queryKey: RELEASE_PLAN_KEY });
}

// Confirming a release: the server re-reads the remote and tags the exact
// commit it finds, so this sends only the chosen step, never a path or a
// cached revision. Success invalidates the harness read — the tag it just
// pushed is the fact that repaints the quiet state, and the plan is gone the
// moment it is chosen anyway.
export function usePublishRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (step: SemverStep) =>
      requestJson<{ tag: string; revision: string }>("/api/harness/release", {
        method: "POST",
        body: JSON.stringify({ step }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: HARNESS_KEY });
    },
  });
}

// Writes the fetched state straight into the query cache: a refresh already
// carries the answer, so re-reading it would only show an older picture first.
export function useRefreshHarness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      requestJson<HarnessState>("/api/harness/refresh", { method: "POST" }),
    onSuccess: (state) => {
      // The plain read races this one on open. Cancelling it first stops a
      // slower GET from repainting the pre-fetch picture over this answer.
      // Not awaited: the cancel takes effect at once, and waiting for the
      // aborted request would hold the mutation open across a remount.
      void queryClient.cancelQueries({ queryKey: HARNESS_KEY });
      queryClient.setQueryData(HARNESS_KEY, state);
    },
  });
}
