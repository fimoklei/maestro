import { Button } from "../ui/button";

// The next step belongs in a target confirmed empty, not in page-level chrome.
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
