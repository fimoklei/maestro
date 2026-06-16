import { toDriftView } from "../drift/drift-query-view";
import { useGlobalDrift } from "../drift/use-drift";
import { DeployStateList } from "./deploy-state-list";
import { useGlobalDeployState } from "./use-global-deploy-state";

// Fixed "Global" panel: global is the baseline, so the heading always renders —
// even while loading and even when nothing is deployed globally yet. A failed
// read gets a visible error; an empty list must never stand in for "I couldn't
// read this" (the lie J03 exists to prevent).
export function GlobalDeployStatePanel() {
  const deployState = useGlobalDeployState();
  const drift = useGlobalDrift();

  return (
    <section>
      <h3>Global</h3>
      {deployState.isLoading ? (
        <p>Loading…</p>
      ) : deployState.isError ? (
        <p role="alert">Could not read the global deploy-state.</p>
      ) : (
        <DeployStateList
          primitives={deployState.data?.primitives ?? []}
          skipped={deployState.data?.skipped ?? []}
          drift={toDriftView(drift)}
        />
      )}
    </section>
  );
}
