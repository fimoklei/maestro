import { HttpError } from "../api/http";
import { useRegistry } from "../registry/use-registry";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";
import { InventoryList } from "./inventory-list";
import { useDeploymentTargets } from "./use-deployment-targets";
import { useInventory } from "./use-inventory";

// Container: wires the inventory server-state hook to the presentational list,
// styled in Control Room (SectionHeader over a Card of rows) to match the
// Deploy-state view. The 409 "not-configured" case gets its own actionable
// message, distinct from a generic load failure, so the user knows to set the
// clone path.
export function InventoryPanel() {
  const inventory = useInventory();
  const registry = useRegistry();
  const repos = registry.data?.repos ?? [];
  // Every deploy target the deployed column pivots over, gathered once here so the
  // list stays presentational (frontend.md: hooks hold data). Reuses the cockpit's
  // existing deploy-state + drift queries — no new server read (#272). The
  // registry's own state rides along so repo reach stays unconfirmed until the
  // repo set is known.
  const targets = useDeploymentTargets(
    repos.map((repo) => repo.path),
    { isLoading: registry.isLoading, isError: registry.isError },
  );

  const skillCount = inventory.data?.primitives.length ?? 0;

  return (
    // Beside the detail pane the card takes the height of the scrolling region
    // (100cqh, the content height of the shell's main container) and the table
    // scrolls inside it, so the column headers and the pane stay put while the
    // list moves. Below that width the pane stacks under the table and the page
    // scrolls as one, which needs no height bound.
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
            ? "No inventory is configured. Set the agent-harness clone path."
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
