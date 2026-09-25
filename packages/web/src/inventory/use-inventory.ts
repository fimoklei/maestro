// Server-state hook for the central inventory (frontend.md — no fetch-in-effect).
import type { GitHubPage } from "@maestro/core";
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";

export type Primitive = { type: "skill"; name: string; description: string };

type InventoryResponse = { primitives: Primitive[] };

// Exported so the connect mutation invalidates this exact cache entry.
export const INVENTORY_KEY = ["inventory", "primitives"] as const;

// Exported so a publication can read the Inventory itself, whether or not a
// screen is holding this query open.
export const fetchInventoryPrimitives = () =>
  requestJson<InventoryResponse>("/api/inventory/primitives");

// Gates the read for callers without a source yet — during first-run the
// endpoint 409s.
export function useInventory({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: INVENTORY_KEY,
    queryFn: fetchInventoryPrimitives,
    enabled,
  });
}

type InventoryConfigResponse = {
  inventoryPath: string | null;
  githubRepository: string | null;
  github?: GitHubPage;
};

// Exported so the connect mutation invalidates it after a re-point.
export const INVENTORY_CONFIG_KEY = ["inventory", "config"] as const;

export function useInventoryConfig() {
  return useQuery({
    queryKey: INVENTORY_CONFIG_KEY,
    queryFn: () =>
      requestJson<InventoryConfigResponse>("/api/inventory/config"),
  });
}
