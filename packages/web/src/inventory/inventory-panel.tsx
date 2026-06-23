import { HttpError } from "../api/http";
import { useRegistry } from "../registry/use-registry";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";
import { InventoryList } from "./inventory-list";
import { useInventory } from "./use-inventory";

// Container: wires the inventory server-state hook to the presentational list,
// styled in Control Room (SectionHeader over a Card of rows) to match the
// Deploy-state view. The 409 "not-configured" case gets its own actionable
// message, distinct from a generic load failure, so the user knows to set the
// clone path.
export function InventoryPanel() {
  const inventory = useInventory();
  const registry = useRegistry();

  const skillCount = inventory.data?.primitives.length ?? 0;

  return (
    <section>
      <SectionHeader
        title="Central inventory"
        meta={
          inventory.isSuccess
            ? `${skillCount} ${skillCount === 1 ? "skill" : "skills"}`
            : undefined
        }
      />
      {inventory.isLoading ? (
        <p className="px-card-x py-row-y text-dim text-tag">Loading…</p>
      ) : inventory.isError ? (
        <p role="alert" className="text-amber-ink text-tag">
          {inventory.error instanceof HttpError &&
          inventory.error.status === 409
            ? "No inventory is configured. Set the agent-harness clone path."
            : "Could not load the inventory."}
        </p>
      ) : (
        <Card>
          <InventoryList
            primitives={inventory.data?.primitives ?? []}
            repos={registry.data?.repos ?? []}
            registryReady={registry.isSuccess}
          />
        </Card>
      )}
    </section>
  );
}
