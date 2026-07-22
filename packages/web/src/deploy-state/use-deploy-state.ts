// Server-state hook for a single repo's deploy-state. The deploy-state lives on
// the server (it reads the repo's apm.lock.yaml); the screen only caches it via
// TanStack Query, keyed by repo path so each repo has its own cache entry (see
// .claude/rules/frontend.md).
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";

export type DeployedPrimitive = {
  type: "skill";
  name: string;
  version: string;
};

export type SkippedEntry = { virtualPath: string; packageType: string };

type DeployStateResponse = {
  primitives: DeployedPrimitive[];
  skipped: SkippedEntry[];
};

// The query config, shared so a single-repo `useDeployState` and the multi-repo
// `useQueries` roll-up read one repo's deploy-state the exact same way (same key,
// same fetch) — they must never diverge or two screens would cache-miss each
// other. No staleTime: this is a cheap local lockfile read, kept live so an
// external `apm` change (a lockfile edited outside Maestro) shows on open/focus.
export function deployStateQueryOptions(repo: string) {
  return {
    queryKey: ["deploy-state", repo] as const,
    queryFn: () =>
      requestJson<DeployStateResponse>(
        `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
      ),
  };
}

export function useDeployState(repo: string, enabled = true) {
  return useQuery({ ...deployStateQueryOptions(repo), enabled });
}
