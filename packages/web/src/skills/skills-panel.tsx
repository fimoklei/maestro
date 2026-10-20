import { useIsFetching } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { HttpError } from "../api/http";
import { DEPLOY_STATE_KEY } from "../deploy-state/use-deploy-state";
import { harnessHeadings } from "../harness/notice-copy";
import { useDeletionCheck, useHarness } from "../harness/use-harness";
import { cloneReading } from "../inventory/clone-reading";
import { INVENTORY_NOT_READ } from "../inventory/inventory-copy";
import { useInventoryOf } from "../inventory/use-inventory";
import { useRegistry } from "../registry/use-registry";
import { useRereadInventory } from "../shell/use-reread-inventory";
import { queryReading } from "../ui/freshness";
import type { ReadFailure } from "../ui/use-table-screen";
import { SkillsView } from "./skills-view";
import { useDeploymentTargets } from "./use-deployment-targets";

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

export function SkillsPanel() {
  const inventory = useInventoryOf("skill");
  const registry = useRegistry();
  const invalidate = useRereadInventory();
  const navigate = useNavigate();
  const harness = useHarness();
  const check = useDeletionCheck();
  // Drift is left out, as on Deploy-state: its apm run is slow, so the rows
  // never wait for it; the Status cell shows its own skeleton meanwhile. The
  // deletion check is left out too: Delete skill states its own wait.
  const readingDeployState = useIsFetching({ queryKey: DEPLOY_STATE_KEY }) > 0;
  const repos = registry.data?.repos ?? [];
  // Reuses the existing deploy-state + drift queries — no new server read (#272).
  const { targets, reads } = useDeploymentTargets(
    repos.map((repo) => repo.path),
    { isLoading: registry.isLoading, isError: registry.isError },
  );

  // A disconnected Harness is a different list, so no old row stays; any other
  // failure keeps the previous rows.
  const disconnected =
    inventory.error instanceof HttpError && inventory.error.status === 409;

  return (
    <SkillsView
      primitives={disconnected ? undefined : inventory.data}
      repos={repos}
      registryReady={registry.isSuccess}
      targets={targets}
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
      // The registry read decides which targets there are, so it is one too.
      reads={[...[inventory, registry].map(queryReading), ...reads]}
      failure={readFailure(inventory.error)}
      reading={
        inventory.isFetching || registry.isFetching || readingDeployState
      }
      onReread={invalidate}
      onOpenHarness={() => navigate("/harness")}
      // Deploy-state is the index route; it opens the row it is sent (#1065).
      onShowTarget={(rowId) => navigate("/", { state: { openTarget: rowId } })}
      clone={cloneReading(harness, check, "skill")}
      // The work lands on the Harness view, as Import local edits does
      // (#1385).
      onDeleted={(name) =>
        navigate("/harness", {
          state: { openPrimitive: { type: "skill", name } },
        })
      }
    />
  );
}
