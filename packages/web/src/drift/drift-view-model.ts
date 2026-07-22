// The one owner of drift status in `web`. Every screen — the repo card, the
// sidebar Targets list, the global targets section (and its per-tool slice of the
// single global drift check), the deploy action — reads drift through this view-
// model instead of hand-piping the query mapping and the joins. It hides:
//   - the query -> view mapping (the old toDriftView relabeler),
//   - the per-skill join (skillStatus, latest, syncedState — the old
//     deriveSyncedState relabeler folded in),
//   - the per-target join (targetIndicator),
//   - the J04 rule (a check that could not run is never up-to-date),
//   - the empty-target "empty wins" rule,
//   - orphan-behind,
//   - the deployed -> latest version-pair lookup.
// Pure and framework-free, sibling-tested. The screens build one from their drift
// query; the global section narrows it per tool with forTool.

import type { UseQueryResult } from "@tanstack/react-query";
import type { DeployedView } from "../deploy-state/deployed-view";
import type { DeployedPrimitive } from "../deploy-state/use-deploy-state";
import type { DriftResponse, VersionDrift } from "./use-drift";

// A per-skill badge state. "up-to-date" is only ever derived from a check that
// ran; every un-run state (pending/unknown/unverified) stays honest (J04).
export type DriftStatus =
  | "behind"
  | "up-to-date"
  | "unknown"
  | "unverified"
  | "pending";

// A whole target's roll-up. "empty" is a confirmed-empty deployment; "drift"
// needs a deployed skill behind; the un-run states never read as "ok".
export type TargetDriftIndicator =
  | "ok"
  | "drift"
  | "empty"
  | "unknown"
  | "unverified"
  | "pending";

export type SyncedState = "synced" | "not-synced";

// The drift query reduced to a view-state, internal to this module. A request
// failure (or a { ok: false } body) becomes "unknown", never up-to-date — the
// same honesty the server keeps when its body says the check could not run.
type DriftView =
  | { status: "pending" }
  | { status: "unknown" }
  | { status: "unverified" }
  | { status: "ready"; behind: VersionDrift[] };

export interface DriftViewModel {
  // Per-skill badge for a deployed skill name.
  skillStatus(name: string): DriftStatus;
  // The latest tag for a behind skill, for the deployed -> latest pair; undefined
  // unless the check ran and this name is behind.
  latest(name: string): string | undefined;
  // The whole target's roll-up against its deployed set.
  targetIndicator(deployed: DeployedView): TargetDriftIndicator;
  // How many deployed-here skills are behind — the `▲N` count. Shares the exact
  // orphan-behind join `targetIndicator` uses, so N > 0 iff the indicator reads
  // "drift" (a target never shows `▲0`). Zero for every un-run or empty state.
  driftCount(deployed: DeployedView): number;
  // Behind names the check reported that are not deployed here — surfaced, never
  // dropped, so the cockpit does not silently hide a behind primitive.
  orphanBehind(deployedNames: string[]): string[];
  // "already synced": the skill is deployed AND its exact version is up-to-date.
  syncedState(
    deployed: DeployedPrimitive[] | undefined,
    skillName: string,
  ): SyncedState;
  // Narrow the single global drift check to one tool's skills, so a skill behind
  // on another tool never surfaces here.
  forTool(names: string[]): DriftViewModel;
}

export function driftViewModel(
  query: Pick<UseQueryResult<DriftResponse>, "data" | "isError">,
): DriftViewModel {
  return fromDriftView(mapDriftQuery(query));
}

function mapDriftQuery(
  query: Pick<UseQueryResult<DriftResponse>, "data" | "isError">,
): DriftView {
  if (query.isError) {
    return { status: "unknown" };
  }
  if (query.data === undefined) {
    return { status: "pending" };
  }
  // The check ran iff the body carries a behind set; { ok: false } means it could
  // not run — shown as unknown, never up-to-date (J04).
  if ("behind" in query.data) {
    return { status: "ready", behind: query.data.behind };
  }
  // apm reached the tool but could not resolve against the remote: its own state,
  // so the badge points at auth/network rather than a bare "unknown".
  if (query.data.reason === "unverified") {
    return { status: "unverified" };
  }
  return { status: "unknown" };
}

function fromDriftView(view: DriftView): DriftViewModel {
  const skillStatus = (name: string): DriftStatus => {
    switch (view.status) {
      case "pending":
        return "pending";
      case "unknown":
        return "unknown";
      case "unverified":
        return "unverified";
      case "ready":
        return view.behind.some((entry) => entry.name === name)
          ? "behind"
          : "up-to-date";
    }
  };

  const latest = (name: string): string | undefined =>
    view.status === "ready"
      ? view.behind.find((entry) => entry.name === name)?.latest
      : undefined;

  // One roll-up owns both the state and the `▲N` count so they read the same
  // behind<->deployed join and can never disagree. "empty" comes first: a target
  // with nothing deployed (deployed read cleanly, zero primitives and zero skipped
  // entries) can't drift, so a confirmed-empty deployment wins over the drift
  // check — even a failed or still-loading one. A lockfile of only unsupported
  // types has zero primitives but a non-empty skipped set: it does contain
  // deployed content, so it is not empty and falls through. Emptiness only counts
  // once deployed is confirmed (status "ready").
  const rollUp = (
    deployed: DeployedView,
  ): { state: TargetDriftIndicator; behindCount: number } => {
    if (
      deployed.status === "ready" &&
      deployed.names.length === 0 &&
      deployed.skippedCount === 0
    ) {
      return { state: "empty", behindCount: 0 };
    }
    switch (view.status) {
      case "pending":
        return { state: "pending", behindCount: 0 };
      case "unknown":
        return { state: "unknown", behindCount: 0 };
      case "unverified":
        return { state: "unverified", behindCount: 0 };
      case "ready":
        switch (deployed.status) {
          case "pending":
            return { state: "pending", behindCount: 0 };
          case "unknown":
            return { state: "unknown", behindCount: 0 };
          case "ready": {
            // An orphan-behind (a behind name not deployed here) cannot be updated
            // here, so it must not flip the target to "drift" nor inflate the count.
            const names = new Set(deployed.names);
            const behindCount = view.behind.filter((entry) =>
              names.has(entry.name),
            ).length;
            return {
              state: behindCount > 0 ? "drift" : "ok",
              behindCount,
            };
          }
        }
    }
  };

  const targetIndicator = (deployed: DeployedView): TargetDriftIndicator =>
    rollUp(deployed).state;

  const driftCount = (deployed: DeployedView): number =>
    rollUp(deployed).behindCount;

  const orphanBehind = (deployedNames: string[]): string[] => {
    if (view.status !== "ready") {
      return [];
    }
    const deployed = new Set(deployedNames);
    return view.behind
      .map((entry) => entry.name)
      .filter((name) => !deployed.has(name));
  };

  const syncedState = (
    deployed: DeployedPrimitive[] | undefined,
    skillName: string,
  ): SyncedState => {
    if (!deployed?.some((primitive) => primitive.name === skillName)) {
      return "not-synced";
    }
    return skillStatus(skillName) === "up-to-date" ? "synced" : "not-synced";
  };

  const forTool = (names: string[]): DriftViewModel => {
    if (view.status !== "ready") {
      return fromDriftView(view);
    }
    const wanted = new Set(names);
    return fromDriftView({
      status: "ready",
      behind: view.behind.filter((entry) => wanted.has(entry.name)),
    });
  };

  return {
    skillStatus,
    latest,
    targetIndicator,
    driftCount,
    orphanBehind,
    syncedState,
    forTool,
  };
}
