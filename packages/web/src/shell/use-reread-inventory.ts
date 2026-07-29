import { useQueryClient } from "@tanstack/react-query";
import {
  INVENTORY_CONFIG_KEY,
  INVENTORY_KEY,
} from "../inventory/use-inventory";

// Offline read-on-demand, no background sync: "re-read" drops the cached
// copies and lets Query refetch (frontend.md).
export function useRereadInventory(): () => void {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
    queryClient.invalidateQueries({ queryKey: INVENTORY_CONFIG_KEY });
  };
}
