// The deployed column's pivot: per-target deploy-state + drift folded onto
// one row per skill (#272, ADR-0005/0007). Pure — the cell reads it, never
// re-derives.

import type { DeployedView } from "../deploy-state/deployed-view";
import type { DeployedPrimitive } from "../deploy-state/use-deploy-state";
import type { DriftViewModel } from "../drift/drift-view-model";
import type { DeployTarget } from "./use-deploy-skill";

// Count roll-up reads `deployed` + `drift`; the skill detail pane reads
// `label` + `primitives`. Both fold the same fetched data, so they can't
// disagree (ADR-0016). `primitives` meaningful only when status is "ready".
export type DeploymentTarget = {
  label: string;
  // Which target a write would name. Global's per-tool rows all carry
  // `{ kind: "global" }` — one apm removal covers every tool (ADR-0013).
  target: DeployTarget;
  deployed: DeployedView;
  primitives: DeployedPrimitive[];
  drift: DriftViewModel;
};

// No mark means confirmed up-to-date on every target — silence never stands
// for "we couldn't check" (J04).
export type DeployedRollup = {
  targetCount: number;
  behindCount: number;
  unknownCount: number;
  // True while any read is in flight — zero is then "unconfirmed", not
  // "deployed nowhere". Absent treated as resolved.
  pending?: boolean;
  unreadable?: boolean;
  // Distinct from the ? marker (a check that could not run) — this is one
  // still running.
  checking?: boolean;
};

export function rollUpDeployment(
  skillName: string,
  targets: DeploymentTarget[],
): DeployedRollup {
  let targetCount = 0;
  let behindCount = 0;
  let unknownCount = 0;
  let pending = false;
  let unreadable = false;
  let checking = false;

  for (const target of targets) {
    if (target.deployed.status === "pending") {
      pending = true;
    }
    if (target.deployed.status === "unknown") {
      unreadable = true;
    }
    // Not "ready" is unknown, not "deployed nowhere" — left out until resolved.
    if (target.deployed.status !== "ready") {
      continue;
    }
    if (!target.deployed.names.includes(skillName)) {
      continue;
    }
    targetCount++;

    const status = target.drift.skillStatus(skillName);
    if (status === "behind") {
      behindCount++;
    } else if (status === "unknown" || status === "unverified") {
      unknownCount++;
    } else if (status === "pending") {
      checking = true;
    }
  }

  return {
    targetCount,
    behindCount,
    unknownCount,
    pending,
    unreadable,
    checking,
  };
}
