// Server-state hook for one repo's version drift (server runs `apm outdated`).
// Separate query from deploy-state: the skill list renders immediately, the
// badge fills in later (frontend.md). Long staleTime — a drift check isn't free.

import type { ReadDriftEntry, VersionDrift } from "@maestro/core";
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";

// Type-only re-export: verbatimModuleSyntax erases it, so no core runtime
// reaches the bundle (#248, ADR-0012).
export type { ReadDriftEntry, VersionDrift };

// Mirrors core's DriftResult at the HTTP boundary (web never imports core
// values, ADR-0012). Never up-to-date.
export type DriftResponse =
  | { behind: ReadDriftEntry[] }
  | { ok: false; reason?: "unverified" };

const FIVE_MINUTES = 5 * 60 * 1000;

// Shared so single-repo and multi-repo readers run identically — a diverging
// key would re-shell the same check.
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
