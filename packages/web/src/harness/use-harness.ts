// Server-state for the Harness home base (frontend.md — no fetch-in-effect).
// Two operations: a plain read that paints the local picture at once, and a
// refresh that reaches the remote and replaces it.

import type {
  HarnessFreshness,
  HarnessReleaseState,
  HarnessState,
} from "@maestro/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";

// Re-exported rather than copied, so the browser's shape cannot drift from the
// one core defines (architecture.md).
export type { HarnessFreshness, HarnessReleaseState, HarnessState };

const HARNESS_KEY = ["harness", "state"] as const;

export function useHarness() {
  return useQuery({
    queryKey: HARNESS_KEY,
    queryFn: () => requestJson<HarnessState>("/api/harness"),
  });
}

// Writes the fetched state straight into the query cache: a refresh already
// carries the answer, so re-reading it would only show an older picture first.
export function useRefreshHarness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      requestJson<HarnessState>("/api/harness/refresh", { method: "POST" }),
    onSuccess: async (state) => {
      // The plain read races this one on open. Cancelling it first stops a
      // slower GET from repainting the pre-fetch picture over this answer.
      await queryClient.cancelQueries({ queryKey: HARNESS_KEY });
      queryClient.setQueryData(HARNESS_KEY, state);
    },
  });
}
