// Accepts the scaffold offer the connect refusal carried; it ends connected, so
// it invalidates exactly what connecting does (#556).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import {
  type ConnectResponse,
  refreshInventoryReads,
} from "./use-connect-inventory";

export function useScaffoldHarness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) =>
      requestJson<ConnectResponse>("/api/harness/scaffold", {
        method: "POST",
        body: JSON.stringify({ path }),
      }),
    onSuccess: (data) =>
      refreshInventoryReads(queryClient, {
        connectedPath: data.inventoryPath,
        harness: true,
      }),
  });
}
