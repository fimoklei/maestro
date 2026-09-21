// Server-state hook for a single repo's deploy-state, keyed by repo path
// (frontend.md).
import type {
  DeployedPrimitive,
  PendingOperation,
  PinnedPerSkill,
  ReleaseHead,
  SkippedEntry,
} from "@maestro/core";
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";

// Re-exported rather than copied, so the two ends of the wire cannot drift
// (architecture.md).
export type {
  DeployedPrimitive,
  PendingOperation,
  PinnedPerSkill,
  ReleaseHead,
  SkippedEntry,
};

type DeployStateResponse = {
  primitives: DeployedPrimitive[];
  skipped: SkippedEntry[];
  // Absent where the target follows no single release (ADR-0031).
  releaseHead?: ReleaseHead;
  // Absent unless the target still holds per-skill dependencies (#950).
  pinnedPerSkill?: PinnedPerSkill;
  // Absent where the record holds no file outside the selected skills.
  extraFiles?: number;
  // Absent unless a Deploy or Remove on this target never finished (#951).
  pendingOperation?: PendingOperation;
};

// Shared so single-repo and multi-repo readers use the same key/fetch — they
// must never diverge or two screens would cache-miss each other. No staleTime:
// kept live so an external apm change shows on open/focus. The one query that
// opts back into focus, against the root's default (#1037).
export function deployStateQueryOptions(repo: string) {
  return {
    queryKey: ["deploy-state", repo] as const,
    queryFn: () =>
      requestJson<DeployStateResponse>(
        `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
      ),
    refetchOnWindowFocus: true,
  };
}

export function useDeployState(repo: string, enabled = true) {
  return useQuery({ ...deployStateQueryOptions(repo), enabled });
}
