// A successful connect invalidates the inventory query so the cockpit
// refetches the now-readable skills (frontend.md).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import { INVENTORY_CONFIG_KEY, INVENTORY_KEY } from "./use-inventory";

export type ConnectResponse = {
  inventoryPath: string;
  primitiveCount: number;
};

export function useConnectInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) =>
      requestJson<ConnectResponse>("/api/inventory/connect", {
        method: "POST",
        body: JSON.stringify({ path }),
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
