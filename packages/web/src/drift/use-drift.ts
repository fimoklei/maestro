import type { ReadDriftEntry } from "@maestro/core";
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";

// Type-only: a value re-export would pull core runtime into the bundle (#248).
export type { ReadDriftEntry };

export type DriftResponse =
  | { behind: ReadDriftEntry[] }
  | { ok: false; reason?: "unverified" };

const FIVE_MINUTES = 5 * 60 * 1000;

// Shared by single- and multi-repo readers: a diverging key re-runs the check.
export function driftQueryOptions(repo: string) {
  return {
    queryKey: ["drift", repo] as const,
    queryFn: () =>
      requestJson<DriftResponse>(`/api/drift?repo=${encodeURIComponent(repo)}`),
    staleTime: FIVE_MINUTES,
  };
}

export function useDrift(repo: string, enabled = true) {
  return useQuery({ ...driftQueryOptions(repo), enabled });
}

export function useGlobalDrift(enabled = true) {
  return useQuery({
    queryKey: ["drift", "global"],
    queryFn: () => requestJson<DriftResponse>("/api/drift/global"),
    staleTime: FIVE_MINUTES,
    enabled,
  });
}
