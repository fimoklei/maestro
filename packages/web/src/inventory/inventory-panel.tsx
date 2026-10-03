import { useNavigate } from "react-router";
import { HttpError } from "../api/http";
import { useRegistry } from "../registry/use-registry";
import { useRereadInventory } from "../shell/use-reread-inventory";
import type { ReadFailure } from "../ui/use-table-screen";
import { INVENTORY_NOT_READ } from "./inventory-copy";
import { InventoryView } from "./inventory-view";
import { useDeploymentTargets } from "./use-deployment-targets";
import { useInventory } from "./use-inventory";

// Container: wires the inventory server-state hooks to the presentational
// view. The 409 "not-configured" case gets its own actionable message.

// The inventory read is web's own query, not one of the server's error tables,
// so its two headings and sentences live with it.
function readFailure(error: Error | null): ReadFailure | null {
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
    : INVENTORY_NOT_READ;
}

export function InventoryPanel() {
  const inventory = useInventory();
  const registry = useRegistry();
  const invalidate = useRereadInventory();
  const navigate = useNavigate();
  const repos = registry.data?.repos ?? [];
  // Reuses the existing deploy-state + drift queries — no new server read (#272).
  const targets = useDeploymentTargets(
    repos.map((repo) => repo.path),
    { isLoading: registry.isLoading, isError: registry.isError },
  );

  // A disconnected Harness is a different list, so no old row stays; any other
  // failure keeps the previous rows.
  const disconnected =
    inventory.error instanceof HttpError && inventory.error.status === 409;

  return (
    <InventoryView
      primitives={disconnected ? undefined : inventory.data?.primitives}
      repos={repos}
      registryReady={registry.isSuccess}
      targets={targets}
      failure={readFailure(inventory.error)}
      reading={inventory.isFetching}
      onReread={invalidate}
      onOpenHarness={() => navigate("/harness")}
      // Deploy-state is the index route; it opens the row it is sent (#1065).
      onShowTarget={(rowId) => navigate("/", { state: { openTarget: rowId } })}
    />
  );
}
