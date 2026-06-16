// Server-state hook for one repo's version drift. Drift lives on the server (it
// runs `apm outdated`); the screen only caches it via TanStack Query, keyed by
// repo path. It is a separate query from deploy-state by design: the skill list
// renders immediately and the per-skill badge fills in when this resolves
// (frontend.md). A long staleTime keeps it from re-running on every focus — a
// drift check shells out and is not free.

import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";

// The two honest server outcomes: the check ran (a behind set, possibly empty),
// or it could not run ({ ok: false }) — which the screen shows as "unknown",
// never as up-to-date.
export type DriftResponse = { behind: string[] } | { ok: false };

const FIVE_MINUTES = 5 * 60 * 1000;

export function useDrift(repo: string) {
  return useQuery({
    queryKey: ["drift", repo],
    queryFn: () =>
      requestJson<DriftResponse>(`/api/drift?repo=${encodeURIComponent(repo)}`),
    staleTime: FIVE_MINUTES,
  });
}

export function useGlobalDrift() {
  return useQuery({
    queryKey: ["drift", "global"],
    queryFn: () => requestJson<DriftResponse>("/api/drift/global"),
    staleTime: FIVE_MINUTES,
  });
}
