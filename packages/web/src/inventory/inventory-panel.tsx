import { HttpError } from "../api/http";
import { useRegistry } from "../registry/use-registry";
import { Card } from "../ui/card";
import { Notice, type NoticeContent } from "../ui/notice";
import { SectionHeader } from "../ui/section-header";
import { InventoryList } from "./inventory-list";
import { useDeploymentTargets } from "./use-deployment-targets";
import { useInventory } from "./use-inventory";

// Container: wires the inventory server-state hook to the presentational list.
// The 409 "not-configured" case gets its own actionable message.

// The inventory read is web's own query, not one of the server's error tables,
// so its two headings and sentences live with it.
function readNotice(error: Error | null): NoticeContent | null {
  if (error === null) {
    return null;
  }
  return error instanceof HttpError && error.status === 409
    ? {
        level: "error",
        label: "No Harness connected",
        message:
          "Connect a Harness on the Harness location screen to fill this list.",
        detail: "Nothing is connected yet.",
      }
    : {
        level: "error",
        label: "Inventory not loaded",
        message: "Check the path on the Harness location screen.",
        detail:
          "The connected Harness may have moved, or its apm.yml may no longer be readable.",
      };
}

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
      {/* A section that failed to load is always trigger="load" — nothing here
          followed a click, and Query refetches on window focus (#465). The
          region outlives its content, so it is mounted before the failure is. */}
      <Notice trigger="load" notice={readNotice(inventory.error)} />
      {inventory.isLoading ? (
        <p className="px-card-x py-row-y text-dim text-tag">
          Loading the Inventory…
        </p>
      ) : inventory.isError ? null : (
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
