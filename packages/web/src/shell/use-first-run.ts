import { useInventoryConfig } from "../inventory/use-inventory";

// Single source of truth for "is this a first run". Pending reads false, same
// as useIsConfigured — every consumer renders its normal shape until known.
export function useFirstRun(): boolean {
  const config = useInventoryConfig();
  return config.isSuccess && config.data.inventoryPath === null;
}

// True only once positively confirmed — steers a configured user away from
// the connect gate on a direct/deep-link visit too, not just auto-redirect (#96).
export function useIsConfigured(): boolean {
  const config = useInventoryConfig();
  return config.isSuccess && config.data.inventoryPath !== null;
}
