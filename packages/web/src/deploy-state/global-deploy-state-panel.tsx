import { driftViewModel } from "../drift/drift-view-model";
import { useGlobalDrift } from "../drift/use-drift";
import { GlobalTargets } from "./global-targets";
import { useGlobalDeployState } from "./use-global-deploy-state";

// Container for the "GLOBAL TARGETS" section: it owns the two server-state
// queries (per-tool deploy-state and the single global drift check) and hands
// their state to the presentational GlobalTargets (frontend.md). A global deploy
// invalidates the ["deploy-state","global"] and ["drift","global"] queries, so
// the cards refetch without a reload. The drift check is one apm-outdated run for
// all global skills; each tool card filters it to its own skills.
export function GlobalDeployStatePanel() {
  const deployState = useGlobalDeployState();
  const drift = useGlobalDrift();

  return (
    <GlobalTargets
      isLoading={deployState.isLoading}
      isError={deployState.isError}
      tools={deployState.data?.tools ?? []}
      skipped={deployState.data?.skipped ?? []}
      drift={driftViewModel(drift)}
    />
  );
}
