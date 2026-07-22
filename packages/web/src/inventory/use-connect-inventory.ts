// Server-state mutation for the offline connect-inventory flow. The inventory
// path lives on the server; connecting persists it, so a successful connect
// invalidates the inventory query and the cockpit refetches the now-readable
// skills (see .claude/rules/frontend.md). Mirrors useRegisterRepo.
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
      // Seed the config cache synchronously from the mutation's own response,
      // not just invalidateQueries: invalidation only marks the query stale
      // and schedules a background refetch, it does not update the cache
      // itself. The connect gate navigates onward the moment the user clicks
      // Continue, which can be before that refetch resolves — without this,
      // useFirstRun would still read the pre-connect cached answer at that
      // instant and the gate would bounce the user straight back to /welcome
      // (Codex review finding). invalidateQueries still runs after, so the
      // cache reconciles with the server's own view once the refetch lands.
      queryClient.setQueryData(INVENTORY_CONFIG_KEY, {
        inventoryPath: data.inventoryPath,
      });
      queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
      queryClient.invalidateQueries({ queryKey: INVENTORY_CONFIG_KEY });
    },
  });
}
