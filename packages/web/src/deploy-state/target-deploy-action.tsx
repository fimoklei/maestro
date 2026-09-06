import { Button } from "../ui/button";

// The next step belongs in a target holding nothing of ours, not in page-level
// chrome — a confirmed-empty one, or one holding copies from another origin.
export function TargetDeployAction({
  onStartDeploy,
}: {
  onStartDeploy: () => void;
}) {
  return (
    <div className="px-card-x py-row-y">
      <Button variant="ghost" size="sm" onClick={onStartDeploy}>
        Deploy a skill
      </Button>
    </div>
  );
}
