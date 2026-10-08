import { useIsFetching } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { HttpError } from "../api/http";
import { harnessHeadings } from "../harness/notice-copy";
import { useDeletionCheck, useHarness } from "../harness/use-harness";
import { useRegistry } from "../registry/use-registry";
import { useRereadInventory } from "../shell/use-reread-inventory";
import type { ReadFailure } from "../ui/use-table-screen";
import { INVENTORY_NOT_READ } from "./inventory-copy";
import { type CloneReading, InventoryView } from "./inventory-view";
import { useDeploymentTargets } from "./use-deployment-targets";
import { useInventory } from "./use-inventory";

// Container: wires the inventory server-state hooks to the presentational
// view. The 409 "not-configured" case gets its own actionable message.

// A disconnected Harness reads as the Harness screen states it.
function readFailure(error: Error | null): ReadFailure | null {
  if (error === null) {
    return null;
  }
  return error instanceof HttpError && error.status === 409
    ? harnessHeadings["not-configured"]
    : INVENTORY_NOT_READ;
}

export function InventoryPanel() {
  const inventory = useInventory();
  const registry = useRegistry();
  const invalidate = useRereadInventory();
  const navigate = useNavigate();
  const harness = useHarness();
  const check = useDeletionCheck();
  // Drift is left out, as on Deploy-state: its apm run is slow, so the rows
  // never wait for it; the Status cell shows its own skeleton meanwhile.
  const readingDeployState = useIsFetching({ queryKey: ["deploy-state"] }) > 0;
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
      reading={
        inventory.isFetching ||
        registry.isFetching ||
        readingDeployState ||
        check.isFetching
      }
      onReread={invalidate}
      onOpenHarness={() => navigate("/harness")}
      // Deploy-state is the index route; it opens the row it is sent (#1065).
      onShowTarget={(rowId) => navigate("/", { state: { openTarget: rowId } })}
      clone={cloneReading(harness, check)}
      // The work lands on the Harness view, as Import local edits does
      // (#1385).
      onDeleted={(skill) =>
        navigate("/harness", { state: { openSkill: skill } })
      }
    />
  );
}

// "No Working Harness" is the Harness read's own answer, not the check's.
function cloneReading(
  harness: ReturnType<typeof useHarness>,
  check: ReturnType<typeof useDeletionCheck>,
): CloneReading {
  if (
    harness.error instanceof HttpError &&
    harness.error.code === "not-configured"
  ) {
    return { kind: "no-harness" };
  }
  if (check.isError) {
    return { kind: "failed" };
  }
  return check.data === undefined
    ? { kind: "checking" }
    : { kind: "read", skills: check.data.skills };
}
