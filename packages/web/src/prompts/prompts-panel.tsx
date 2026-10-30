import type { HarnessState } from "@maestro/core";
import { useNavigate } from "react-router";
import { HttpError } from "../api/http";
import { useCategories } from "../categories/use-categories";
import type { HarnessArrival } from "../harness/harness-route";
import { harnessHeadings } from "../harness/notice-copy";
import { useDeletionCheck, useHarness } from "../harness/use-harness";
import { cloneReading } from "../inventory/clone-reading";
import { inventoryNotRead } from "../inventory/inventory-copy";
import { useInventoryOf } from "../inventory/use-inventory";
import { useRereadInventory } from "../shell/use-reread-inventory";
import { queryReading } from "../ui/freshness";
import type { WriteResult } from "../ui/use-write-action";
import { PromptsView } from "./prompts-view";

// The prompts whose deletion in the clone Restore prompt can undo.
const restorablePrompts = (
  state: HarnessState | undefined,
): ReadonlySet<string> =>
  new Set(
    Object.values(state?.stages ?? {})
      .flatMap((stage) => (stage.outcome === "read" ? stage.rows : []))
      .filter((row) => row.type === "prompt" && row.restorable)
      .map((row) => row.name),
  );

// Container: wires the Inventory and Harness reads to the presentational view.
export function PromptsPanel() {
  const inventory = useInventoryOf("prompt");
  const harness = useHarness();
  const invalidate = useRereadInventory();
  const navigate = useNavigate();
  const check = useDeletionCheck();
  const categories = useCategories();
  // A disconnected Harness is a different list, so no old row stays and the
  // screen states it as the Harness screen does; any other failure keeps the
  // previous rows.
  const disconnected =
    inventory.error instanceof HttpError && inventory.error.status === 409;
  // A write to the clone lands on the Harness view, as Delete skill's does
  // (#1385); no row there leaves nothing selected.
  const landOnHarness = (name: string, written: WriteResult) =>
    navigate("/harness", {
      state: {
        openPrimitive: { type: "prompt", name },
        written,
      } satisfies HarnessArrival,
    });

  return (
    <PromptsView
      prompts={disconnected ? undefined : inventory.data}
      assignments={
        categories.isSuccess ? categories.data.assignments : undefined
      }
      harness={
        harness.isSuccess
          ? {
              origin: harness.data.origin,
              github: harness.data.github,
              latestRelease: harness.data.releasedVersion,
            }
          : harness.isError
            ? null
            : undefined
      }
      reads={[queryReading(inventory)]}
      failure={
        inventory.error === null
          ? null
          : disconnected
            ? harnessHeadings["not-configured"]
            : inventoryNotRead("Prompts")
      }
      reading={inventory.isFetching}
      onReread={invalidate}
      onOpenHarness={() => navigate("/harness")}
      clone={cloneReading(harness, check, "prompt")}
      localDeletions={restorablePrompts(harness.data)}
      // The work lands on the Harness view, as Delete skill's does (#1385).
      onDeleted={landOnHarness}
      onEdited={landOnHarness}
    />
  );
}
