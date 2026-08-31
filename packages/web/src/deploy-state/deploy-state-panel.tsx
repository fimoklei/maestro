import { useRef } from "react";
import { driftViewModel } from "../drift/drift-view-model";
import { useDrift } from "../drift/use-drift";
import { targetLabel } from "../shell/target-label";
import { Card } from "../ui/card";
import { Notice } from "../ui/notice";
import { DeployStateList } from "./deploy-state-list";
import { toDeployedView } from "./deployed-view";
import { TargetDeployAction } from "./target-deploy-action";
import { TargetStatusChip } from "./target-status-chip";
import { useDeployState } from "./use-deploy-state";

// One repo's target card. Deploy-state and drift are separate queries: the
// skill list renders first, each drift badge fills in later. A failed read
// gets a visible error — never an empty list standing in for it.
export function DeployStatePanel({
  repo,
  siblings = [],
  onStartDeploy,
}: {
  repo: string;
  // Every registered repo path, so the label grows only far enough to stay
  // distinct from the others (#211). Empty when rendered in isolation.
  siblings?: string[];
  onStartDeploy: () => void;
}) {
  const deployState = useDeployState(repo);
  const drift = driftViewModel(useDrift(repo));
  const indicator = drift.targetIndicator(toDeployedView(deployState));
  // Where focus goes when a removal destroys the row it was triggered from.
  const headerRef = useRef<HTMLHeadingElement>(null);

  return (
    <Card
      title={<span title={repo}>{targetLabel(repo, siblings)}</span>}
      titleRef={headerRef}
      kind="local"
      drift={indicator === "drift"}
      status={<TargetStatusChip indicator={indicator} />}
    >
      {deployState.isLoading ? (
        <p className="px-card-x py-row-y text-dim text-tag">
          Loading the deploy-state…
        </p>
      ) : deployState.isError ? (
        <div className="px-card-x py-row-y">
          <Notice
            trigger="load"
            notice={{
              level: "error",
              label: "this repo's deploy-state could not be read",
              message: "Reload the page to run the read again.",
            }}
          />
        </div>
      ) : indicator === "empty" ? (
        <TargetDeployAction onStartDeploy={onStartDeploy} />
      ) : (
        <DeployStateList
          primitives={deployState.data?.primitives ?? []}
          skipped={deployState.data?.skipped ?? []}
          drift={drift}
          target={{ kind: "repo", repoPath: repo }}
          onRemoved={() => headerRef.current?.focus()}
        />
      )}
    </Card>
  );
}
