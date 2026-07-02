import { useQueryClient } from "@tanstack/react-query";
import {
  INVENTORY_CONFIG_KEY,
  INVENTORY_KEY,
} from "../inventory/use-inventory";

// Re-read the inventory from disk on demand. Maestro's inventory model is
// offline read-on-demand — there is no background sync, so "re-read" simply
// drops the cached copies and lets TanStack Query refetch the live primitives
// (and the config path, in case the source moved on disk). Invalidation, not a
// hand-rolled fetch, is what keeps the count on screen honest (see frontend.md).
export function useRereadInventory(): () => void {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
    queryClient.invalidateQueries({ queryKey: INVENTORY_CONFIG_KEY });
  };
}
