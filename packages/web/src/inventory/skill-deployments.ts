// The skill detail pane's "deployed to" lens: a per-primitive slice of the
// targets the deployed column rolls up, so the two can't diverge.

import type { ReleaseHead } from "@maestro/core";
import {
  comparedFact,
  UNFINISHED_REASONS,
} from "../deploy-state/release-head-copy";
import type { RemoveDialogTarget } from "../deploy-state/remove-ledger-rows";
import { type SkillMark, skillMark } from "../deploy-state/skill-mark";
import { globalRowId, repoRowId } from "../deploy-state/target-rows";
import { UNFINISHED } from "../deploy-state/target-status";
import { toolNameList } from "../deploy-state/tool-presentation";
import type { DriftStatus } from "../drift/drift-view-model";
import { type DeploymentTarget, skillReading } from "./deployed-rollup";
import type { DeployTarget } from "./use-deploy-skill";

export type SkillDeployment = {
  label: string;
  // The release the target follows, stated once per row; the recorded pin where
  // the target follows no single release.
  release: string;
  /** The deployed copy's own version, which a removal names. */
  version: string;
  // Never up to date for an un-run check.
  status: DriftStatus;
  /** The row's mark: the target's unfinished operation, else Deploy-state's skill mark. */
  mark: SkillMark | null;
  /** What an update sends; every tool row names the one global target. */
  target: DeployTarget;
  /** What a removal names: a global one covers every detected tool. */
  removeTarget: RemoveDialogTarget;
  /** The name Update target's dialog carries. */
  updateName: string;
  /** The Deploy-state row this target is (#1065); null where it names none. */
  rowId: string | null;
  // A newer release changed this skill here, and the target follows one
  // release, so Update target can move it.
  updatable: boolean;
};

// Unreadable/loading is unknown, not "not deployed" — left out.
function deployedTargets(skillName: string, targets: DeploymentTarget[]) {
  return targets.flatMap((target) => {
    const deployed =
      target.deployed.status === "ready"
        ? target.primitives.find((primitive) => primitive.name === skillName)
        : undefined;
    return deployed === undefined ? [] : [{ target, deployed }];
  });
}

// A never-read or unparsable time is the oldest of all.
const readAt = (head: ReleaseHead): number => {
  const at =
    head.comparedAt === null ? Number.NaN : Date.parse(head.comparedAt);
  return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
};

/** The read age of the skill's oldest-read target; null where none was compared. */
export function skillReadAge(
  skillName: string,
  targets: DeploymentTarget[],
  now: Date,
): string | null {
  const heads = deployedTargets(skillName, targets).flatMap(({ target }) =>
    target.releaseHead === undefined ? [] : [target.releaseHead],
  );
  const oldest = heads.reduce<ReleaseHead | null>(
    (stalest, head) =>
      stalest === null || readAt(head) < readAt(stalest) ? head : stalest,
    null,
  );
  return oldest === null ? null : comparedFact(oldest, now);
}

export function skillDeployments(
  skillName: string,
  targets: DeploymentTarget[],
): SkillDeployment[] {
  const rows: SkillDeployment[] = [];
  // One global removal or update covers every detected tool.
  const tools = targets.flatMap((target) =>
    target.tool === undefined ? [] : [target.tool],
  );

  for (const { target, deployed } of deployedTargets(skillName, targets)) {
    const wire = target.target;
    const status = skillReading(target, skillName);
    rows.push({
      label: target.label,
      release: target.releaseHead?.release ?? deployed.version,
      version: deployed.version,
      status,
      mark: target.pending
        ? {
            ...UNFINISHED[target.pending],
            hint: UNFINISHED_REASONS[target.pending],
          }
        : skillMark(deployed.copy, status),
      target: wire,
      removeTarget:
        wire.kind === "repo" ? wire : { kind: "global", tools: [...tools] },
      updateName: wire.kind === "repo" ? target.label : toolNameList(tools),
      rowId:
        wire.kind === "repo"
          ? repoRowId(wire.repoPath)
          : target.tool === undefined
            ? null
            : globalRowId(target.tool),
      updatable: target.releaseHead !== undefined && status === "behind",
    });
  }

  return rows;
}
