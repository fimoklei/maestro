// Server-state mutation for the offline connect-inventory flow. The inventory
// path lives on the server; connecting persists it, so a successful connect
// invalidates the inventory query and the cockpit refetches the now-readable
// skills (see .claude/rules/frontend.md). Mirrors useRegisterRepo.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import { INVENTORY_CONFIG_KEY, INVENTORY_KEY } from "./use-inventory";

type ConnectResponse = { inventoryPath: string };

export function useConnectInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) =>
      requestJson<ConnectResponse>("/api/inventory/connect", {
        method: "POST",
        body: JSON.stringify({ path }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
      queryClient.invalidateQueries({ queryKey: INVENTORY_CONFIG_KEY });
    },
  });
}
