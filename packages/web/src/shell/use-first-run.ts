import { useInventoryConfig } from "../inventory/use-inventory";

// True once the config query confirms no inventory is connected. The single
// source of truth for "is this a first run" — the gate's redirect, the
// sidebar's inert rendering, and the wizard all key off this instead of each
// re-deriving the inventoryPath-is-null check (and risking disagreeing).
// While the config query is still pending, this reads false: every consumer
// renders its normal (configured) shape until the answer is known, never an
// inert flash.
export function useFirstRun(): boolean {
  const config = useInventoryConfig();
  return config.isSuccess && config.data.inventoryPath === null;
}

// The other side of the same signal: true only once the config query has
// positively confirmed an inventory is connected. The gate uses this to also
// steer a configured user *away* from the wizard on a direct/deep-link visit
// (not just away from the "not configured" dead-end) — "the wizard never
// shows" (issue #96) has to hold for direct navigation, not only the
// auto-redirect path. Pending and first-run both read false here, same
// not-yet-decided default as useFirstRun.
export function useIsConfigured(): boolean {
  const config = useInventoryConfig();
  return config.isSuccess && config.data.inventoryPath !== null;
}
