import { useRef } from "react";
import { driftViewModel } from "../drift/drift-view-model";
import { useDrift } from "../drift/use-drift";
import { targetLabel } from "../shell/target-label";
import { Card } from "../ui/card";
import { DeployStateList } from "./deploy-state-list";
import { toDeployedView } from "./deployed-view";
import { TargetStatusChip } from "./target-status-chip";
import { useDeployState } from "./use-deploy-state";

// One repo's target card. Deploy-state and drift are two separate queries — the
// skill list renders as soon as deploy-state arrives, and each skill's drift
// badge fills in when the drift check resolves. A failed deploy-state read (e.g.
// a malformed lockfile) gets a visible error — an empty list must never stand in
// for "I couldn't read this".
export function DeployStatePanel({
  repo,
  siblings = [],
}: {
  repo: string;
  // Every registered repo path, so this card's label grows only far enough to
  // stay distinct from the others (#211). Empty when rendered in isolation.
  siblings?: string[];
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
        <p className="px-card-x py-row-y text-dim text-tag">Loading…</p>
      ) : deployState.isError ? (
        <p role="alert" className="px-card-x py-row-y text-amber-ink text-tag">
          Could not read this repo's deploy-state.
        </p>
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
