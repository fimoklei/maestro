// The deployed column's pivot: per-target deploy-state + drift folded onto
// one row per skill (#272, ADR-0005/0007). Pure — the cell reads it, never
// re-derives.

import type { DeployedView } from "../deploy-state/deployed-view";
import type {
  DeployedPrimitive,
  ReleaseHead,
} from "../deploy-state/use-deploy-state";
import type { DriftStatus, DriftViewModel } from "../drift/drift-view-model";
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
  // The one release this target follows (ADR-0031). Absent where it follows
  // none — a target still pinned per skill, or one whose read has not landed.
  releaseHead?: ReleaseHead;
};

// The Selection where the target follows one release; what is on disk only
// where it follows none, the one case with no Selection to read (spec story 52).
const selects = (target: DeploymentTarget, skillName: string): boolean =>
  target.deployed.status === "ready" &&
  (target.releaseHead?.selection ?? target.deployed.names).includes(skillName);

// One per-skill reading from the Release heads a target carries. Behind means
// this skill's own files differ at the newest release, never that the target
// is. Undefined where no head is known (ADR-0031, #956).
export function headsReading(
  heads: readonly (ReleaseHead | undefined)[],
  skillName: string,
): DriftStatus | undefined {
  const known = heads.filter((head) => head !== undefined);
  if (known.length === 0) {
    return undefined;
  }
  // One behind copy makes the skill behind; an unread comparison beats a clean
  // one, so a partial answer never reads as up to date (J04).
  if (known.some((head) => head.changedSkills?.includes(skillName))) {
    return "behind";
  }
  return known.some((head) => head.changedSkills === undefined)
    ? "unknown"
    : "up-to-date";
}

// The Inventory's two lenses share this, so the count and the detail pane can
// never disagree (ADR-0016).
export const skillReading = (
  target: DeploymentTarget,
  skillName: string,
): DriftStatus =>
  headsReading([target.releaseHead], skillName) ??
  target.drift.skillStatus(skillName);

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

// Where Update target would move this skill: the first target it reads Behind
// on, in the order the roll-up counts them.
export function behindTarget(
  skillName: string,
  targets: DeploymentTarget[],
): DeployTarget | undefined {
  return targets.find(
    (target) =>
      selects(target, skillName) &&
      skillReading(target, skillName) === "behind",
  )?.target;
}
