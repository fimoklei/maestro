// The skill detail pane's "deployed to" lens (#290, ADR-0016): a per-primitive
// slice of the same targets the deployed column rolls up, so the two can't diverge.

import type { DriftStatus } from "../drift/drift-view-model";
import { type DeploymentTarget, skillReading } from "./deployed-rollup";

export type SkillDeployment = {
  label: string;
  // The release the target follows, stated once per row (ADR-0031). Falls back
  // to the recorded pin where the target follows no single release.
  release: string;
  // Never up-to-date for an un-run check (J04, see deploy-state/deployed-view.ts).
  status: DriftStatus;
};

export function skillDeployments(
  skillName: string,
  targets: DeploymentTarget[],
): SkillDeployment[] {
  const rows: SkillDeployment[] = [];

  for (const target of targets) {
    // Unreadable/loading is unknown, not "not deployed" — left out (J04).
    if (target.deployed.status !== "ready") {
      continue;
    }
    const deployed = target.primitives.find(
      (primitive) => primitive.name === skillName,
    );
    if (deployed === undefined) {
      continue;
    }

    rows.push({
      label: target.label,
      release: target.releaseHead?.release ?? deployed.version,
      status: skillReading(target, skillName),
    });
  }

  return rows;
}
