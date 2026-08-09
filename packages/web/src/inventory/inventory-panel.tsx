import { HttpError } from "../api/http";
import { useRegistry } from "../registry/use-registry";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";
import { InventoryList } from "./inventory-list";
import { useDeploymentTargets } from "./use-deployment-targets";
import { useInventory } from "./use-inventory";

// Container: wires the inventory server-state hook to the presentational list.
// The 409 "not-configured" case gets its own actionable message.
export function InventoryPanel() {
  const inventory = useInventory();
  const registry = useRegistry();
  const repos = registry.data?.repos ?? [];
  // Reuses the existing deploy-state + drift queries — no new server read (#272).
  const targets = useDeploymentTargets(
    repos.map((repo) => repo.path),
    { isLoading: registry.isLoading, isError: registry.isError },
  );

  const skillCount = inventory.data?.primitives.length ?? 0;

  return (
    // 100cqh: the table scrolls inside a bounded card so headers stay put.
    // Below 1200px the pane stacks under the table and needs no height bound.
    <section className="flex flex-col min-[1200px]:h-[100cqh]">
      <SectionHeader
        level={1}
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
            ? "No inventory is configured. Set the Harness source path."
            : "Could not load the inventory."}
        </p>
      ) : (
        <Card fill>
          <InventoryList
            primitives={inventory.data?.primitives ?? []}
            repos={repos}
            registryReady={registry.isSuccess}
            targets={targets}
          />
        </Card>
      )}
    </section>
  );
}
