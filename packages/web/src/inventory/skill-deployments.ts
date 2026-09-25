// The skill detail pane's "deployed to" lens: a per-primitive slice of the
// targets the deployed column rolls up, so the two can't diverge.

import type { RemoveDialogTarget } from "../deploy-state/remove-ledger-rows";
import { globalRowId, repoRowId } from "../deploy-state/target-rows";
import { toolNameList } from "../deploy-state/tool-labels";
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

export function skillDeployments(
  skillName: string,
  targets: DeploymentTarget[],
): SkillDeployment[] {
  const rows: SkillDeployment[] = [];
  // One global removal or update covers every detected tool.
  const tools = targets.flatMap((target) =>
    target.tool === undefined ? [] : [target.tool],
  );

  for (const target of targets) {
    // Unreadable/loading is unknown, not "not deployed" — left out.
    if (target.deployed.status !== "ready") {
      continue;
    }
    const deployed = target.primitives.find(
      (primitive) => primitive.name === skillName,
    );
    if (deployed === undefined) {
      continue;
    }

    const wire = target.target;
    const status = skillReading(target, skillName);
    rows.push({
      label: target.label,
      release: target.releaseHead?.release ?? deployed.version,
      version: deployed.version,
      status,
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
