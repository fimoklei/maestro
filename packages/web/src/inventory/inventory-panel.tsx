import { HttpError } from "../api/http";
import { useRegistry } from "../registry/use-registry";
import { InventoryList } from "./inventory-list";
import { useInventory } from "./use-inventory";

// Container: wires the inventory server-state hook to the presentational list.
// The 409 "not-configured" case gets its own actionable message, distinct from
// a generic load failure, so the user knows to set the clone path.
export function InventoryPanel() {
  const inventory = useInventory();
  const registry = useRegistry();

  if (inventory.isLoading) {
    return (
      <section>
        <h2>Central inventory</h2>
        <p>Loading…</p>
      </section>
    );
  }

  if (inventory.isError) {
    const notConfigured =
      inventory.error instanceof HttpError && inventory.error.status === 409;
    return (
      <section>
        <h2>Central inventory</h2>
        <p role="alert">
          {notConfigured
            ? "No inventory is configured. Set the agent-harness clone path."
            : "Could not load the inventory."}
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2>Central inventory</h2>
      <InventoryList
        primitives={inventory.data?.primitives ?? []}
        repos={registry.data?.repos ?? []}
      />
    </section>
  );
}
