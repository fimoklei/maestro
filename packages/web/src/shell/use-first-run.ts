import { useInventoryConfig } from "../inventory/use-inventory";

// Pending reads false, as useIsConfigured does, so consumers render their
// normal shape until known.
export function useFirstRun(): boolean {
  const config = useInventoryConfig();
  return config.isSuccess && config.data.inventoryPath === null;
}

// True only once confirmed; also steers a configured user off a deep link to
// the connect gate (#96).
export function useIsConfigured(): boolean {
  const config = useInventoryConfig();
  return config.isSuccess && config.data.inventoryPath !== null;
}
