// The skill detail pane's "deployed to" lens: one skill's deployed version at
// each target that actually holds it (#290, ADR-0016). A per-primitive slice of
// the same targets the deployed column rolls up — the pane reads label + version,
// the column reads the count, both from one fetched set so they cannot diverge.
// Pure and framework-free, sibling-tested; the pane presents these rows and never
// re-derives them.

import type { DriftStatus } from "../drift/drift-view-model";
import type { DeploymentTarget } from "./deployed-rollup";

export type SkillDeployment = {
  // The target this copy lives at, named for a human.
  label: string;
  // The deployed resolved ref at this target.
  version: string;
  // This target's drift for the skill, so a behind copy reads as behind, never
  // as up-to-date (J04).
  status: DriftStatus;
  // The latest tag, only when the check ran and this copy is behind — for the
  // deployed -> latest pair.
  latest?: string;
};

export function skillDeployments(
  skillName: string,
  targets: DeploymentTarget[],
): SkillDeployment[] {
  const rows: SkillDeployment[] = [];

  for (const target of targets) {
    // Only a confirmed-ready read tells us what is deployed here; a still-loading
    // or unreadable target is unknown, not "not deployed", so it is left out
    // rather than shown as a definite absence (J04).
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
      ...(status === "behind" && latest ? { latest } : {}),
    });
  }

  return rows;
}
