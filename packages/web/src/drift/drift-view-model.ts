// The one owner of drift status in `web`; forTool narrows per tool.

import type { UseQueryResult } from "@tanstack/react-query";
import type { DeployedView } from "../deploy-state/deployed-view";
import type { DeployedPrimitive } from "../deploy-state/use-deploy-state";
import type { DriftResponse, ReadDriftEntry } from "./use-drift";

// "up-to-date" only ever comes from a check that ran.
export type DriftStatus =
  | "behind"
  // A newer release exists but this skill's content did not move; not drift.
  | "older-tag"
  // Deployed name is gone from the latest release: no update destination.
  | "no-longer-released"
  | "up-to-date"
  | "unknown"
  | "unverified"
  | "pending";

// "foreign" is never produced by rollUp: a caller derives it from `empty` plus
// the lockfile's unattributed origins (#655).
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

type DriftView =
  | { status: "pending" }
  | { status: "unknown" }
  | { status: "unverified" }
  | { status: "ready"; behind: ReadDriftEntry[] };

export const lagsPin = (status: DriftStatus): boolean =>
  status === "behind" || status === "older-tag";

export interface DriftViewModel {
  skillStatus(name: string): DriftStatus;
  latest(name: string): string | undefined;
  targetIndicator(deployed: DeployedView): TargetDriftIndicator;
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
  // { ok: false } means the check could not run: unknown, never up-to-date.
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
        return (
          view.behind.find((entry) => entry.name === name)?.reading ??
          "up-to-date"
        );
    }
  };

  const latest = (name: string): string | undefined =>
    view.status === "ready"
      ? view.behind.find((entry) => entry.name === name)?.latest
      : undefined;

  // Confirmed-empty wins over any drift reading; skipped-only entries aren't empty.
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
            const names = new Set(deployed.names);
            const hasNoLongerReleased = view.behind.some(
              (entry) =>
                entry.reading === "no-longer-released" && names.has(entry.name),
            );
            if (hasNoLongerReleased) {
              return { state: "attention", behindCount: 0 };
            }
            // Moved skills only: orphan-behind and a lagging pin never flip "drift".
            const behindCount = view.behind.filter(
              (entry) => entry.reading === "behind" && names.has(entry.name),
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
      .filter((entry) => entry.reading === "behind")
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
