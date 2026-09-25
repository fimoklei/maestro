// The deployed column's pivot: per-target deploy-state + drift folded onto one
// row per skill (#272).

import type { DeployedView } from "../deploy-state/deployed-view";
import type {
  DeployedPrimitive,
  ReleaseHead,
} from "../deploy-state/use-deploy-state";
import type { DriftStatus, DriftViewModel } from "../drift/drift-view-model";
import type { DeployTarget } from "./use-deploy-skill";

// The count reads `deployed` + `drift`; the detail pane reads `label` +
// `primitives`, meaningful only when status is "ready".
export type DeploymentTarget = {
  label: string;
  // Which target a write would name; every global per-tool row carries
  // `{ kind: "global" }`: one apm removal covers every tool.
  target: DeployTarget;
  /** The detected tool a global row stands for; absent on a repository. */
  tool?: string;
  deployed: DeployedView;
  primitives: DeployedPrimitive[];
  drift: DriftViewModel;
  // The one release this target follows. Absent where it follows none — pinned
  // per skill, or its read has not landed.
  releaseHead?: ReleaseHead;
};

// The Selection where the target follows one release; what is on disk where it
// follows none.
const selects = (target: DeploymentTarget, skillName: string): boolean =>
  target.deployed.status === "ready" &&
  (target.releaseHead?.selection ?? target.deployed.names).includes(skillName);

// One per-skill reading from the target's Release heads: behind means this
// skill's own files differ at the newest release (#956). Undefined where no
// head is known.
export function headsReading(
  heads: readonly (ReleaseHead | undefined)[],
  skillName: string,
): DriftStatus | undefined {
  const known = heads.filter((head) => head !== undefined);
  if (known.length === 0) {
    return undefined;
  }
  // One behind copy makes the skill behind; an unread comparison beats a clean
  // one, so a partial answer never reads as up to date.
  if (known.some((head) => head.changedSkills?.includes(skillName))) {
    return "behind";
  }
  return known.some((head) => head.changedSkills === undefined)
    ? "unknown"
    : "up-to-date";
}

// The Inventory's two lenses share this, so the count and the detail pane can
// never disagree.
export const skillReading = (
  target: DeploymentTarget,
  skillName: string,
): DriftStatus =>
  headsReading([target.releaseHead], skillName) ??
  target.drift.skillStatus(skillName);

// No mark means confirmed up to date on every target, never "we couldn't check".
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
    if (!selects(target, skillName)) {
      continue;
    }
    targetCount++;

    const status = skillReading(target, skillName);
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
