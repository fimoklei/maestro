import { useQueryClient } from "@tanstack/react-query";
import { refreshInventoryReads } from "../inventory/use-connect-inventory";

// Drops the cached copies and lets Query refetch.
export function useRereadInventory(): () => void {
  const queryClient = useQueryClient();
  return () =>
    refreshInventoryReads(queryClient, { connectedPath: null, harness: false });
}
