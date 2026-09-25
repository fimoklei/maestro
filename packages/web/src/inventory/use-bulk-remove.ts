// One request for the whole run (#422). Re-reading the targets belongs to
// closing the report (#424), not to the request.
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
