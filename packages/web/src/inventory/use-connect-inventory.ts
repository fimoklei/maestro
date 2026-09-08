// A successful connect invalidates the inventory query so the cockpit
// refetches the now-readable skills (frontend.md).
import type { ConnectOutcome } from "@maestro/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
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
    // uses the home ceiling (#555).
    mutationFn: (variables: { path: string; parent?: string }) =>
      requestJson<ConnectResponse>("/api/inventory/connect", {
        method: "POST",
        body: JSON.stringify(variables),
      }),
    onSuccess: (data) => {
      // Seeded synchronously — invalidateQueries alone wouldn't land before
      // the gate navigates on Continue, bouncing the user back (Codex finding).
      queryClient.setQueryData(INVENTORY_CONFIG_KEY, {
        inventoryPath: data.inventoryPath,
      });
      queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
      queryClient.invalidateQueries({ queryKey: INVENTORY_CONFIG_KEY });
    },
  });
}
