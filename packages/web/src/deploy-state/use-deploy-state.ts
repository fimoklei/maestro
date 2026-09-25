import type {
  DeployedPrimitive,
  GitHubPage,
  PendingOperation,
  PinnedPerSkill,
  ReleaseHead,
  SkippedEntry,
} from "@maestro/core";
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";

export type {
  DeployedPrimitive,
  GitHubPage,
  PendingOperation,
  PinnedPerSkill,
  ReleaseHead,
  SkippedEntry,
};

type DeployStateResponse = {
  primitives: DeployedPrimitive[];
  skipped: SkippedEntry[];
  releaseHead?: ReleaseHead;
  pinnedPerSkill?: PinnedPerSkill;
  extraFiles?: number;
  pendingOperation?: PendingOperation;
  // Absent where the repository has no page on GitHub (#1180).
  github?: GitHubPage;
  // Absent where the release has no page on GitHub (#1181).
  releaseGitHub?: GitHubPage;
};

// Shared so every reader uses the same key and fetch; diverging would make two
// screens cache-miss each other. The one query that opts back into focus (#1037).
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
