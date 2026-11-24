// Nothing shows before every read answered, `?` where one failed, and nothing
// at zero (#1115).
import type { HarnessState } from "@maestro/core";
import { useQueries } from "@tanstack/react-query";
import {
  globalReading,
  type Read,
  repoReadings,
  type TargetReading,
} from "../deploy-state/target-readings";
import { deployStateQueryOptions } from "../deploy-state/use-deploy-state";
import { useGlobalDeployState } from "../deploy-state/use-global-deploy-state";
import { useHarness } from "../harness/use-harness";
import { useInventoryConfig } from "../inventory/use-inventory";
import { useRegistry } from "../registry/use-registry";
import type { NavItemProps } from "../ui/nav-item";
import {
  behindCount,
  pendingCount,
  UNKNOWN_COUNT,
  unreadTargetsDetail,
} from "./sidebar-copy";

type NavCounter = NonNullable<NavItemProps["counter"]>;

const unknown = (cause: string | null): NavCounter => ({
  text: UNKNOWN_COUNT.shown,
  unknown: true,
  cause,
});

const count = (text: string): NavCounter => ({ text, unknown: false });

function deployStateCounter(
  registry: Read<unknown>,
  targets: readonly TargetReading[],
): NavCounter | null {
  const failed = targets
    .filter((target) => target.state === "read-failed")
    .map((target) => target.name);
  if (registry.isError || failed.length > 0) {
    return unknown(unreadTargetsDetail(failed, registry.isError));
  }
  if (
    registry.data === undefined ||
    targets.some((target) => target.state === "loading")
  ) {
    return null;
  }
  const behind = targets.filter((target) => target.behind).length;
  return behind === 0 ? null : count(behindCount(behind));
}

// The rows the Harness table shows under its three Pending stages: a skill in
// two stages is two rows.
function harnessCounter(harness: Read<HarnessState>): NavCounter | null {
  if (harness.isError) return unknown(null);
  if (harness.data === undefined) return null;
  const stages = Object.values(harness.data.stages);
  if (stages.some((stage) => stage.outcome !== "read")) return unknown(null);
  const rows = stages.reduce(
    (sum, stage) => sum + (stage.outcome === "read" ? stage.rows.length : 0),
    0,
  );
  return rows === 0 ? null : count(pendingCount(rows));
}

/** Each counter keyed by the screen path it sits beside. */
export function useSidebarCounters(): Record<string, NavCounter | null> {
  // Gated on a connected Harness: its reads answer 409 until one is set.
  const connected = (useInventoryConfig().data?.inventoryPath ?? null) !== null;
  const registry = useRegistry();
  const global = useGlobalDeployState(connected);
  const entries = registry.data?.repos ?? [];
  const repos = useQueries({
    queries: entries.map(({ path }) => ({
      ...deployStateQueryOptions(path),
      enabled: connected,
    })),
  });
  const harness = useHarness({ enabled: connected });

  return {
    "/": deployStateCounter(registry, [
      globalReading(global),
      ...repoReadings(entries, repos),
    ]),
    "/harness": harnessCounter(harness),
  };
}
