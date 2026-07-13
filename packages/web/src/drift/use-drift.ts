// Server-state hook for one repo's version drift. Drift lives on the server (it
// runs `apm outdated`); the screen only caches it via TanStack Query, keyed by
// repo path. It is a separate query from deploy-state by design: the skill list
// renders immediately and the per-skill badge fills in when this resolves
// (frontend.md). A long staleTime keeps it from re-running on every focus — a
// drift check shells out and is not free.

import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";

// One behind skill as the deployed -> latest version pair the server forwards
// from `apm outdated` (ADR-0007). Identity is the name; the pair lets the screen
// show "v0.5.0 -> v0.5.1" without a second apm call. Mirrors core's VersionDrift
// at the HTTP boundary (web never imports core types).
export type VersionDrift = { name: string; current: string; latest: string };

// The honest server outcomes: the check ran (a behind set, possibly empty), or
// it could not — either apm reached the tool but could not resolve against the
// remote (`reason: "unverified"`, shown as its own auth/network state) or a bare
// failure (shown as "unknown"). Never up-to-date. Mirrors core's OutdatedResult
// at the HTTP boundary (web never imports core types).
export type DriftResponse =
  | { behind: VersionDrift[] }
  | { ok: false; reason?: "unverified" };

const FIVE_MINUTES = 5 * 60 * 1000;

export function useDrift(repo: string, enabled = true) {
  return useQuery({
    queryKey: ["drift", repo],
    queryFn: () =>
      requestJson<DriftResponse>(`/api/drift?repo=${encodeURIComponent(repo)}`),
    staleTime: FIVE_MINUTES,
    enabled,
  });
}

export function useGlobalDrift(enabled = true) {
  return useQuery({
    queryKey: ["drift", "global"],
    queryFn: () => requestJson<DriftResponse>("/api/drift/global"),
    staleTime: FIVE_MINUTES,
    enabled,
  });
}
