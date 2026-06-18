import { DeployRefusalNotice } from "../inventory/deploy-refusal-notice";
import {
  type DeployTarget,
  useDeploySkill,
} from "../inventory/use-deploy-skill";

// The Update action on a deployed skill the cockpit reports as behind. Unlike
// the inventory's deploy action it picks no target — the target is the row it
// sits in (this repo, or global). Update is mechanically a re-deploy: the
// shared deploy mutation re-pins to the latest published tag, and on success
// invalidates this target's deploy-state and drift queries, so the row flips
// from behind to up-to-date without a manual reload. The list decides when to
// render this (only on a behind row); the action itself just acts.
export function UpdateSkillAction({
  skillName,
  target,
}: {
  skillName: string;
  target: DeployTarget;
}) {
  const deploy = useDeploySkill();

  return (
    <span>
      <button
        type="button"
        disabled={deploy.isPending}
        onClick={() =>
          deploy.mutate({ type: "skill", name: skillName, target })
        }
      >
        {deploy.isPending ? `Updating ${skillName}…` : `Update ${skillName}`}
      </button>
      {deploy.isError ? (
        // The server's message is actionable; a not-proven-clean deployed copy
        // additionally offers an inline confirmed reinstall (force) instead of
        // dead-ending the user (ADR-0006, #66).
        <DeployRefusalNotice
          error={deploy.error}
          reinstalling={deploy.isPending}
          onReinstall={() =>
            deploy.mutate({
              type: "skill",
              name: skillName,
              target,
              force: true,
            })
          }
        />
      ) : null}
    </span>
  );
}
