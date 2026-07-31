// On success, invalidates the target's deploy-state query so the panel
// refetches without a manual reload (frontend.md).
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { requestJson } from "../api/http";

// Mirrors core's DeployTarget: a repo carries a path; global carries none.
export type DeployTarget =
  | { kind: "repo"; repoPath: string }
  | { kind: "global" };

// One owner for the target half of every per-target query key — a second
// spelling would leave one panel stale after the other refetched.
export function targetQueryKey(target: DeployTarget): string {
  return target.kind === "repo" ? target.repoPath : "global";
}

// Every write to a target refetches both: drift is a separate query, or a badge
// outlives the change that made it wrong (#48).
export function invalidateTarget(
  queryClient: QueryClient,
  target: DeployTarget,
): void {
  const key = targetQueryKey(target);
  queryClient.invalidateQueries({ queryKey: ["deploy-state", key] });
  queryClient.invalidateQueries({ queryKey: ["drift", key] });
}

export type DeployRequest = {
  type: "skill";
  name: string;
  target: DeployTarget;
  // Set only by the inline "Reinstall fresh" confirm, never a plain deploy (ADR-0006, #66).
  force?: boolean;
};

type DeployResponse = {
  deployed: { type: "skill"; name: string; version: string };
};

export function useDeploySkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: DeployRequest) =>
      requestJson<DeployResponse>("/api/deploy", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: (_data, request) =>
      invalidateTarget(queryClient, request.target),
  });
}
