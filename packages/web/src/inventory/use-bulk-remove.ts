// One request for the whole run: the server walks the targets, the web layer
// waits (#421, #422). The report stays on screen after it, so re-reading the
// targets belongs to closing that report (#424) rather than to the request.
import type { BulkRemoveReport, BulkRemoveTarget } from "@maestro/core";
import { useMutation } from "@tanstack/react-query";
import { requestJson } from "../api/http";

export type BulkRemoveRequest = {
  name: string;
  targets: BulkRemoveTarget[];
};

export function useBulkRemove() {
  return useMutation({
    mutationFn: (request: BulkRemoveRequest) =>
      requestJson<BulkRemoveReport>("/api/deploy/remove/bulk", {
        method: "POST",
        body: JSON.stringify(request),
      }),
  });
}
