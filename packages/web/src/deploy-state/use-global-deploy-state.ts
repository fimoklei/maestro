// Server-state hook for the global (user-scope) deploy-state. The server reads
// apm's user-scope apm.lock.yaml and resolves that location itself, so this hook
// sends no path. Its own query key sits alongside the per-repo ones (see
// .claude/rules/frontend.md).
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import type { DeployedPrimitive, SkippedEntry } from "./use-deploy-state";

type DeployStateResponse = {
  primitives: DeployedPrimitive[];
  skipped: SkippedEntry[];
};

export function useGlobalDeployState(enabled = true) {
  return useQuery({
    queryKey: ["deploy-state", "global"],
    queryFn: () => requestJson<DeployStateResponse>("/api/deploy-state/global"),
    enabled,
  });
}
