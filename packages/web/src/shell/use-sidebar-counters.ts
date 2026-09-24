// The sidebar's counters (#991, #1115), read from the queries the screens they
// name already hold. Nothing shows before every read answered, `?` where one
// failed, and nothing at zero: a resting row carries no mark.
import { useQueries } from "@tanstack/react-query";
import { isBehind, isGlobalBehind } from "../deploy-state/target-rows";
import type {
  PendingOperation,
  ReleaseHead,
} from "../deploy-state/use-deploy-state";
import { deployStateQueryOptions } from "../deploy-state/use-deploy-state";
import { useGlobalDeployState } from "../deploy-state/use-global-deploy-state";
import { type HarnessState, useHarness } from "../harness/use-harness";
import { useInventoryConfig } from "../inventory/use-inventory";
import { useRegistry } from "../registry/use-registry";
import { behindCount, UNKNOWN_COUNT } from "./sidebar-copy";

export type NavCounter = { text: string; unknown: boolean };

const UNKNOWN: NavCounter = { text: UNKNOWN_COUNT.shown, unknown: true };

const count = (text: string): NavCounter => ({ text, unknown: false });

type Read<T> = { data: T | undefined; isError: boolean };

// One per Deploy-state row: a behind global target puts every tool row behind.
export function deployStateCounter(
  global: Read<{
    tools: { releaseHead?: ReleaseHead }[];
    pending?: PendingOperation;
  }>,
  repos: readonly Read<{
    releaseHead?: ReleaseHead;
    pendingOperation?: PendingOperation;
  }>[],
): NavCounter | null {
  const reads = [global, ...repos];
  if (reads.some((one) => one.isError)) return UNKNOWN;
  if (
    global.data === undefined ||
    repos.some((one) => one.data === undefined)
  ) {
    return null;
  }
  const { tools, pending } = global.data;
  const globalBehind = isGlobalBehind(tools, pending) ? tools.length : 0;
  const behind =
    globalBehind +
    repos.filter((one) =>
      isBehind(one.data?.releaseHead, one.data?.pendingOperation),
    ).length;
  return behind === 0 ? null : count(behindCount(behind));
}

// Skills waiting on the operator: Pending review plus Pending release, each
// skill once. A change not yet proposed waits on its author, not the operator.
export function harnessCounter(harness: Read<HarnessState>): NavCounter | null {
  if (harness.isError) return UNKNOWN;
  if (harness.data === undefined) return null;
  const { review, release } = harness.data.stages;
  if (review.outcome !== "read" || release.outcome !== "read") return UNKNOWN;
  const skills = new Set(
    [...review.rows, ...release.rows].map((row) => row.skill),
  );
  return skills.size === 0 ? null : count(String(skills.size));
}

/** Each counter keyed by the screen path it sits beside. */
export function useSidebarCounters(): Record<string, NavCounter | null> {
  // Gated on a connected Harness: its reads answer 409 until one is set.
  const connected = (useInventoryConfig().data?.inventoryPath ?? null) !== null;
  const registry = useRegistry();
  const global = useGlobalDeployState(connected);
  const repoPaths = (registry.data?.repos ?? []).map((repo) => repo.path);
  const repos = useQueries({
    queries: repoPaths.map((path) => ({
      ...deployStateQueryOptions(path),
      enabled: connected,
    })),
  });
  const harness = useHarness({ enabled: connected });

  return {
    "/": deployStateCounter(
      {
        data: registry.data &&
          global.data && {
            tools: global.data.tools,
            pending: global.data.pendingOperation,
          },
        isError: registry.isError || global.isError,
      },
      repos,
    ),
    "/harness": harnessCounter(harness),
  };
}
