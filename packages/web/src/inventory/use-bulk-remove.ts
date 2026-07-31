// One request for the whole run: the server walks the targets, the web layer
// waits (#421, #422). Every touched target's deploy-state and drift are
// invalidated however the request ends — a lost answer does not prove the walk
// never ran, so the screen is re-read rather than left guessing (frontend.md).
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
    onSettled: (_data, _error, request) => {
      for (const entry of request.targets) {
        const key = targetQueryKey(entry.target);
        queryClient.invalidateQueries({ queryKey: ["deploy-state", key] });
        queryClient.invalidateQueries({ queryKey: ["drift", key] });
      }
    },
  });
}
