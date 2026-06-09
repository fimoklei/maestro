// Server-state hook for the central inventory. The inventory lives on the
// server (it reads the local agent-harness clone); the screen only caches it
// via TanStack Query, never a hand-rolled fetch-in-effect (see frontend.md).
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";

export type Primitive = { type: "skill"; name: string; description: string };

type InventoryResponse = { primitives: Primitive[] };

const INVENTORY_KEY = ["inventory", "primitives"] as const;

export function useInventory() {
  return useQuery({
    queryKey: INVENTORY_KEY,
    queryFn: () => requestJson<InventoryResponse>("/api/inventory/primitives"),
  });
}
