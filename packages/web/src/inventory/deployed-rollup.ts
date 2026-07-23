// The deployed column's pivot: the per-target deploy-state + drift reads folded
// onto one row per skill (#272, ADR-0005/0007). A target is each global
// tool-install and each registered repo, counted individually. Pure and
// framework-free, sibling-tested; the rendered cell reads the roll-up and never
// re-derives it.

import type { DeployedView } from "../deploy-state/deployed-view";
import type { DeployedPrimitive } from "../deploy-state/use-deploy-state";
import type { DriftViewModel } from "../drift/drift-view-model";

// One deploy target the roll-up folds in: what is deployed there (once the read
// resolves) and that target's drift view-model (already narrowed per tool for the
// global scope, so a skill behind on another tool never spills in).
//
// `label` names the target for a human (a tool's label or a repo path); `primitives`
// carries the versioned deployed set. The count roll-up reads only `deployed` +
// `drift`; the skill detail pane reads `label` + `primitives` for the per-target
// version. Both lenses fold the same fetched data, so they cannot disagree
// (ADR-0016). `primitives` is meaningful only when `deployed.status === "ready"`.
export type DeploymentTarget = {
  label: string;
  deployed: DeployedView;
  primitives: DeployedPrimitive[];
  drift: DriftViewModel;
};

// The three counts a skill row shows: how many targets it reaches, how many are
// confirmed behind (▲N), and how many could not be checked (?). No mark means
// confirmed up-to-date on every target — silence never stands for "we couldn't
// check" (J04).
export type DeployedRollup = {
  targetCount: number;
  behindCount: number;
  unknownCount: number;
  // True while any target's deploy-state read is still in flight, so the reach
  // is not yet fully known. A zero count then is "unconfirmed", not a confirmed
  // "deployed nowhere" — the cell holds off on the definite "not deployed"
  // (J04). Absent is treated as resolved.
  pending?: boolean;
  // True when any target's deploy-state read failed (e.g. a malformed lockfile).
  // Same honesty as pending: the reach is unconfirmed, so a zero count is not a
  // confirmed "nowhere" and a positive count is only a lower bound, never final.
  unreadable?: boolean;
  // True while a deployed target's drift check is still running. A no-marks row
  // means "confirmed up-to-date on every target" (#272); a still-running check
  // must not borrow that silence, so the cell shows a checking marker until it
  // finishes. Distinct from the ? marker, which is a check that could not run.
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
    // A target whose local read has not resolved (still loading) or could not be
    // read (failed) leaves the reach unconfirmed; the caller uses these to hold
    // off on a definite "not deployed" and to mark a positive count incomplete.
    if (target.deployed.status === "pending") {
      pending = true;
    }
    if (target.deployed.status === "unknown") {
      unreadable = true;
    }
    // The count comes purely from the fast local deploy-state read; only a
    // confirmed-deployed target counts. A still-loading or unreadable target is
    // not "deployed nowhere" — it is unknown, so it is left out until it resolves
    // rather than silently lowering the reach.
    if (target.deployed.status !== "ready") {
      continue;
    }
    if (!target.deployed.names.includes(skillName)) {
      continue;
    }
    targetCount++;

    // Drift is judged only against what is deployed here, so an orphan-behind
    // (a behind name not deployed at this target) never reaches this branch.
    const status = target.drift.skillStatus(skillName);
    if (status === "behind") {
      behindCount++;
    } else if (status === "unknown" || status === "unverified") {
      // "could not run" (offline / no token) — kept separate from up-to-date so
      // "we don't know" never reads as in sync.
      unknownCount++;
    } else if (status === "pending") {
      // Still running — not a failure and not up-to-date. Flagged so the row's
      // silence never stands in for a check that has not finished.
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
