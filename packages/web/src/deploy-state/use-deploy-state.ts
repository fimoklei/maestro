// Server-state hook for a single repo's deploy-state, keyed by repo path
// (frontend.md).
import type {
  DeployedPrimitive,
  ReleaseHead,
  SkippedEntry,
} from "@maestro/core";
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";

// Re-exported rather than copied, so the two ends of the wire cannot drift
// (architecture.md).
export type { DeployedPrimitive, ReleaseHead, SkippedEntry };

type DeployStateResponse = {
  primitives: DeployedPrimitive[];
  skipped: SkippedEntry[];
  // Absent where the target follows no single release (ADR-0031).
  releaseHead?: ReleaseHead;
};

// Shared so single-repo and multi-repo readers use the same key/fetch — they
// must never diverge or two screens would cache-miss each other. No staleTime:
// kept live so an external apm change shows on open/focus.
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
