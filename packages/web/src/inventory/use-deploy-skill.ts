// After every deploy attempt, invalidates the target's deploy-state query.
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
  // The receipt the server's own refusal minted. Set only by the inline "Deploy
  // again" confirm, never a plain deploy (#66, #952).
  confirmedCopyReceipt?: string;
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
    // Settled, not success: apm can change the target and the deploy still be
    // refused on what it recorded, and a stale panel would outlive it (#358).
    onSettled: (_data, _error, request) =>
      invalidateTarget(queryClient, request.target),
  });
}
