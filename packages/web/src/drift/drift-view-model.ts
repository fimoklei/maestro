// The one owner of drift status in `web`: query->view mapping, per-skill and
// per-target joins, the J04 rule, empty-wins, orphan-behind. Pure and
// framework-free. Screens build one from their query; forTool narrows per tool.

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
// "foreign" is never produced by rollUp below — a global-only reading a
// caller derives from `empty` plus the lockfile's unattributed origins, so a
// target holding another inventory's primitives never reads as bare (#655).
export type TargetDriftIndicator =
  | "ok"
  // An entry on disk the user has to fix — outranks every drift reading, since
  // a target holding one is neither empty nor in sync (#358).
  | "attention"
  | "drift"
  | "empty"
  | "foreign"
  | "unknown"
  | "unverified"
  | "pending";

type SyncedState = "synced" | "not-synced";

// The drift query reduced to a view-state, internal to this module. A request
// failure (or a { ok: false } body) becomes "unknown", never up-to-date — the
// same honesty the server keeps when its body says the check could not run.
type DriftView =
  | { status: "pending" }
  | { status: "unknown" }
  | { status: "unverified" }
  | { status: "ready"; behind: VersionDrift[] };

export interface DriftViewModel {
  skillStatus(name: string): DriftStatus;
  latest(name: string): string | undefined;
  targetIndicator(deployed: DeployedView): TargetDriftIndicator;
  // Shares targetIndicator's join, so N > 0 iff the indicator reads "drift".
  driftCount(deployed: DeployedView): number;
  // Behind names not deployed here — surfaced, never dropped.
  orphanBehind(deployedNames: string[]): string[];
  syncedState(
    deployed: DeployedPrimitive[] | undefined,
    skillName: string,
  ): SyncedState;
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
  // { ok: false } means the check could not run — unknown, never up-to-date (J04).
  if ("behind" in query.data) {
    return { status: "ready", behind: query.data.behind };
  }
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

  // "empty" comes first: a confirmed-empty deployment wins over the drift
  // check, even a failed or loading one. Only counts once deployed is
  // confirmed ("ready") — skipped-only entries aren't empty.
  const rollUp = (
    deployed: DeployedView,
  ): { state: TargetDriftIndicator; behindCount: number } => {
    if (deployed.status === "ready" && deployed.attentionCount > 0) {
      return { state: "attention", behindCount: 0 };
    }
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
            // Orphan-behind can't be updated here, so it must not flip "drift".
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
