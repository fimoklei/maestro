import type { ConnectOutcome } from "@maestro/core";
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { requestJson } from "../api/http";
import { HARNESS_QUERIES } from "../harness/use-harness";
import { INVENTORY_CONFIG_KEY, INVENTORY_KEY } from "./use-inventory";

// `outcome` is the server's name for what connecting did, carried through so
// the gate's completion copy never has to infer it (#498).
export type ConnectResponse = {
  outcome: ConnectOutcome;
  inventoryPath: string;
  // Null where the released count could not be read (#841).
  primitiveCount: number | null;
};

export function useConnectInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    // `parent` is the folder a cloned Harness lands in; omitted, the server
    // uses the home ceiling (#555). `localOnly` refuses any URL (#995).
    mutationFn: (variables: {
      path: string;
      parent?: string;
      localOnly?: boolean;
    }) =>
      requestJson<ConnectResponse>("/api/inventory/connect", {
        method: "POST",
        body: JSON.stringify(variables),
      }),
    onSuccess: (data) =>
      refreshInventoryReads(queryClient, {
        connectedPath: data.inventoryPath,
        harness: true,
      }),
  });
}

/** Refetches the cached Inventory reads, and with `harness` every Harness read. */
export function refreshInventoryReads(
  queryClient: QueryClient,
  {
    connectedPath,
    harness,
  }: { connectedPath: string | null; harness: boolean },
) {
  // Seeded synchronously after a connect: invalidation alone wouldn't land
  // before the gate navigates on Continue, bouncing the user back.
  if (connectedPath !== null) {
    queryClient.setQueryData(INVENTORY_CONFIG_KEY, {
      inventoryPath: connectedPath,
    });
  }
  void queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
  void queryClient.invalidateQueries({ queryKey: INVENTORY_CONFIG_KEY });
  if (harness) {
    void queryClient.invalidateQueries({ queryKey: HARNESS_QUERIES });
  }
}
