// One request for the whole run: the server walks the targets, the web layer
// waits (#421, #422). On success every touched target's deploy-state and drift
// are invalidated, or the pane would still list what is gone (frontend.md).
import type { BulkRemoveReport, BulkRemoveTarget } from "@maestro/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import { targetQueryKey } from "./use-deploy-skill";

export type BulkRemoveRequest = {
  name: string;
  targets: BulkRemoveTarget[];
};

export function useBulkRemove() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: BulkRemoveRequest) =>
      requestJson<BulkRemoveReport>("/api/deploy/remove/bulk", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: (_data, request) => {
      for (const entry of request.targets) {
        const key = targetQueryKey(entry.target);
        queryClient.invalidateQueries({ queryKey: ["deploy-state", key] });
        queryClient.invalidateQueries({ queryKey: ["drift", key] });
      }
    },
  });
}
