import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { HARNESS_QUERIES } from "../harness/use-harness";
import { refreshInventoryReads } from "./use-connect-inventory";
import { INVENTORY_CONFIG_KEY, INVENTORY_KEY } from "./use-inventory";

const HARNESS_STATE = [...HARNESS_QUERIES, "state"];

function cachedClient() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(INVENTORY_KEY, { primitives: [] });
  queryClient.setQueryData(INVENTORY_CONFIG_KEY, { inventoryPath: "/old" });
  queryClient.setQueryData(HARNESS_STATE, {});
  return queryClient;
}

const invalidated = (queryClient: QueryClient, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated;

describe("refreshInventoryReads", () => {
  it("seeds the connected path and drops every Inventory and Harness read", () => {
    const queryClient = cachedClient();

    refreshInventoryReads(queryClient, {
      connectedPath: "/new",
      harness: true,
    });

    expect(queryClient.getQueryData(INVENTORY_CONFIG_KEY)).toEqual({
      inventoryPath: "/new",
    });
    expect(invalidated(queryClient, INVENTORY_KEY)).toBe(true);
    expect(invalidated(queryClient, INVENTORY_CONFIG_KEY)).toBe(true);
    expect(invalidated(queryClient, HARNESS_STATE)).toBe(true);
  });

  it("re-reads the Inventory alone, keeping the cached path", () => {
    const queryClient = cachedClient();

    refreshInventoryReads(queryClient, { connectedPath: null, harness: false });

    expect(queryClient.getQueryData(INVENTORY_CONFIG_KEY)).toEqual({
      inventoryPath: "/old",
    });
    expect(invalidated(queryClient, INVENTORY_KEY)).toBe(true);
    expect(invalidated(queryClient, INVENTORY_CONFIG_KEY)).toBe(true);
    expect(invalidated(queryClient, HARNESS_STATE)).toBe(false);
  });
});
