import { DeployRefusalNotice } from "../inventory/deploy-refusal-notice";
import {
  type DeployTarget,
  useDeploySkill,
} from "../inventory/use-deploy-skill";
import { Button } from "../ui/button";

// Update on a behind row is mechanically a re-deploy to the row's own target;
// the list decides when to render this, the action itself just acts.
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
      {/* The row already names the skill three cells to the left, so the label
          states the action alone; the accessible name still carries the name. */}
      <Button
        variant="ghost"
        size="sm"
        disabled={deploy.isPending}
        aria-label={
          deploy.isPending
            ? `Updating skill ${skillName}…`
            : `Update skill ${skillName}`
        }
        onClick={() =>
          deploy.mutate({ type: "skill", name: skillName, target })
        }
      >
        {deploy.isPending ? "Updating skill…" : "Update skill"}
      </Button>
      {deploy.isError ? (
        // Offers an inline confirmed reinstall instead of dead-ending (ADR-0006, #66).
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
