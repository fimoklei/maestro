import { useQueryClient } from "@tanstack/react-query";
import { DEPLOY_STATE_KEY } from "../deploy-state/use-deploy-state";
import { DRIFT_KEY } from "../drift/use-drift";
import { DELETION_CHECK_KEY } from "../harness/use-harness";
import { refreshInventoryReads } from "../inventory/use-connect-inventory";
import { REGISTRY_KEY } from "../registry/use-registry";

// Drops the cached copies of every read the Inventory's rows show and lets
// Query refetch.
export function useRereadInventory(): () => void {
  const queryClient = useQueryClient();
  return () => {
    refreshInventoryReads(queryClient, { connectedPath: null, harness: false });
    for (const queryKey of [
      REGISTRY_KEY,
      DEPLOY_STATE_KEY,
      DRIFT_KEY,
      DELETION_CHECK_KEY,
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}
