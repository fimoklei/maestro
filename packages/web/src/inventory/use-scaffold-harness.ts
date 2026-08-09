// Accepting the scaffold offer the connect refusal carried. It ends connected,
// so it invalidates exactly what connecting does (frontend.md, #556).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import type { ConnectResponse } from "./use-connect-inventory";
import { INVENTORY_CONFIG_KEY, INVENTORY_KEY } from "./use-inventory";

export function useScaffoldHarness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) =>
      requestJson<ConnectResponse>("/api/harness/scaffold", {
        method: "POST",
        body: JSON.stringify({ path }),
      }),
    onSuccess: (data) => {
      // Seeded synchronously, as connect does: invalidation alone would not
      // land before the gate navigates on Continue.
      queryClient.setQueryData(INVENTORY_CONFIG_KEY, {
        inventoryPath: data.inventoryPath,
      });
      queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
      queryClient.invalidateQueries({ queryKey: INVENTORY_CONFIG_KEY });
    },
  });
}
