import { toDriftView } from "../drift/drift-query-view";
import { useGlobalDrift } from "../drift/use-drift";
import { Card } from "../ui/card";
import { DeployStateList } from "./deploy-state-list";
import { TargetStatusChip } from "./target-status-chip";
import { useGlobalDeployState } from "./use-global-deploy-state";

// Fixed "Global" target card: global is the baseline, so the card (with its
// title) always renders — even while loading and even when nothing is deployed
// globally yet. A failed read gets a visible error; an empty list must never
// stand in for "I couldn't read this" (the lie J03 exists to prevent).
export function GlobalDeployStatePanel() {
  const deployState = useGlobalDeployState();
  const drift = useGlobalDrift();
  const driftView = toDriftView(drift);

  return (
    <Card
      title="Global"
      kind="global"
      drift={driftView.status === "ready" && driftView.behind.length > 0}
      status={<TargetStatusChip drift={driftView} />}
    >
      {deployState.isLoading ? (
        <p className="px-card-x py-row-y text-dim text-tag">Loading…</p>
      ) : deployState.isError ? (
        <p role="alert" className="px-card-x py-row-y text-amber-ink text-tag">
          Could not read the global deploy-state.
        </p>
      ) : (
        <DeployStateList
          primitives={deployState.data?.primitives ?? []}
          skipped={deployState.data?.skipped ?? []}
          drift={driftView}
          target={{ kind: "global" }}
        />
      )}
    </Card>
  );
}
