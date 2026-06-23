import { toDriftView } from "../drift/drift-query-view";
import { useDrift } from "../drift/use-drift";
import { Card } from "../ui/card";
import { DeployStateList } from "./deploy-state-list";
import { TargetStatusChip } from "./target-status-chip";
import { useDeployState } from "./use-deploy-state";

// One repo's target card. Deploy-state and drift are two separate queries — the
// skill list renders as soon as deploy-state arrives, and each skill's drift
// badge fills in when the drift check resolves. A failed deploy-state read (e.g.
// a malformed lockfile) gets a visible error — an empty list must never stand in
// for "I couldn't read this".
export function DeployStatePanel({ repo }: { repo: string }) {
  const deployState = useDeployState(repo);
  const drift = useDrift(repo);
  const driftView = toDriftView(drift);

  return (
    <Card
      title={repo}
      kind="local"
      drift={driftView.status === "ready" && driftView.behind.length > 0}
      status={<TargetStatusChip drift={driftView} />}
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
          drift={driftView}
          target={{ kind: "repo", repoPath: repo }}
        />
      )}
    </Card>
  );
}
