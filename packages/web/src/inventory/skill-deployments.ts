// The skill detail pane's "deployed to" lens (#290, ADR-0016): a per-primitive
// slice of the same targets the deployed column rolls up, so the two can't diverge.

import { type DriftStatus, lagsPin } from "../drift/drift-view-model";
import type { DeploymentTarget } from "./deployed-rollup";

export type SkillDeployment = {
  label: string;
  version: string;
  // Never up-to-date for an un-run check (J04, see deploy-state/deployed-view.ts).
  status: DriftStatus;
  latest?: string;
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

    const status = target.drift.skillStatus(skillName);
    const latest = target.drift.latest(skillName);
    rows.push({
      label: target.label,
      version: deployed.version,
      status,
      ...(lagsPin(status) && latest ? { latest } : {}),
    });
  }

  return rows;
}
