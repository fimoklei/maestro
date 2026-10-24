import { useNavigate } from "react-router";
import { HttpError } from "../api/http";
import type { HarnessArrival } from "../harness/harness-route";
import { harnessHeadings } from "../harness/notice-copy";
import { useDeletionCheck, useHarness } from "../harness/use-harness";
import { cloneReading } from "../inventory/clone-reading";
import { inventoryNotRead } from "../inventory/inventory-copy";
import { useInventoryOf } from "../inventory/use-inventory";
import { useRereadInventory } from "../shell/use-reread-inventory";
import { queryReading } from "../ui/freshness";
import { PromptsView } from "./prompts-view";

// Container: wires the Inventory and Harness reads to the presentational view.
export function PromptsPanel() {
  const inventory = useInventoryOf("prompt");
  const harness = useHarness();
  const invalidate = useRereadInventory();
  const navigate = useNavigate();
  const check = useDeletionCheck();
  // A disconnected Harness is a different list, so no old row stays and the
  // screen states it as the Harness screen does; any other failure keeps the
  // previous rows.
  const disconnected =
    inventory.error instanceof HttpError && inventory.error.status === 409;

  return (
    <PromptsView
      prompts={disconnected ? undefined : inventory.data}
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
      // The work lands on the Harness view, as Delete skill's does (#1385).
      onDeleted={(name, written) =>
        navigate("/harness", {
          state: {
            openPrimitive: { type: "prompt", name },
            written,
          } satisfies HarnessArrival,
        })
      }
    />
  );
}
