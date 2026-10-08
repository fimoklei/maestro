// Nothing shows before every read answered, `?` where one failed, and nothing
// at zero (#1115).
import type {
  HarnessState,
  PendingOperation,
  ReleaseHead,
} from "@maestro/core";
import { useQueries } from "@tanstack/react-query";
import { isBehind, isGlobalBehind } from "../deploy-state/target-rows";
import { deployStateQueryOptions } from "../deploy-state/use-deploy-state";
import { useGlobalDeployState } from "../deploy-state/use-global-deploy-state";
import { useHarness } from "../harness/use-harness";
import { useInventoryConfig } from "../inventory/use-inventory";
import { useRegistry } from "../registry/use-registry";
import { behindCount, pendingCount, UNKNOWN_COUNT } from "./sidebar-copy";

type NavCounter = { text: string; unknown: boolean };

const UNKNOWN: NavCounter = { text: UNKNOWN_COUNT.shown, unknown: true };

const count = (text: string): NavCounter => ({ text, unknown: false });

type Read<T> = { data: T | undefined; isError: boolean };

// One per Deploy-state row: a behind global target puts every tool row behind.
function deployStateCounter(
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

// The rows the Harness table shows under its three Pending stages: a skill in
// two stages is two rows.
function harnessCounter(harness: Read<HarnessState>): NavCounter | null {
  if (harness.isError) return UNKNOWN;
  if (harness.data === undefined) return null;
  const stages = Object.values(harness.data.stages);
  if (stages.some((stage) => stage.outcome !== "read")) return UNKNOWN;
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
