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

export function useDeployState(repo: string) {
  return useQuery({
    queryKey: ["deploy-state", repo],
    queryFn: () =>
      requestJson<DeployStateResponse>(
        `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
      ),
  });
}
