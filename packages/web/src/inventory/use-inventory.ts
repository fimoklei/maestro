// Server-state hook for the central inventory. The inventory lives on the
// server (it reads the local agent-harness clone); the screen only caches it
// via TanStack Query, never a hand-rolled fetch-in-effect (see frontend.md).
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";

export type Primitive = { type: "skill"; name: string; description: string };

type InventoryResponse = { primitives: Primitive[] };

// The inventory query key, exported so the connect mutation invalidates the very
// same cache entry this query owns (a drifting copy would silently break the
// post-connect refetch).
export const INVENTORY_KEY = ["inventory", "primitives"] as const;

// `enabled` gates the read for callers that only have a source some of the time
// (the header, which must not fetch primitives during first-run when the path is
// still null and the endpoint 409s). Defaults to on, so callers that always have
// a configured inventory (the source view) stay unchanged.
export function useInventory({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: INVENTORY_KEY,
    queryFn: () => requestJson<InventoryResponse>("/api/inventory/primitives"),
    enabled,
  });
}

type InventoryConfigResponse = { inventoryPath: string | null };

// The currently configured inventory path (or null). Exported so the connect
// mutation invalidates it after a re-point, keeping the Settings screen in sync.
export const INVENTORY_CONFIG_KEY = ["inventory", "config"] as const;

// Server-state hook for the configured inventory path. The Settings screen reads
// it to show what is connected and pre-fill the re-point field.
export function useInventoryConfig() {
  return useQuery({
    queryKey: INVENTORY_CONFIG_KEY,
    queryFn: () =>
      requestJson<InventoryConfigResponse>("/api/inventory/config"),
  });
}
