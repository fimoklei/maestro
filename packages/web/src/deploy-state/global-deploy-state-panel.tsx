import { driftViewModel } from "../drift/drift-view-model";
import { useGlobalDrift } from "../drift/use-drift";
import { GlobalTargets } from "./global-targets";
import { useGlobalDeployState } from "./use-global-deploy-state";
import { useRetryOperation } from "./use-retry-operation";

// Owns the two server-state queries (deploy-state, drift) and hands them to
// the presentational GlobalTargets (frontend.md). Drift is one apm-outdated
// run for all global skills; each tool card filters it to its own.
export function GlobalDeployStatePanel({
  onStartDeploy,
}: {
  onStartDeploy: () => void;
}) {
  const deployState = useGlobalDeployState();
  const drift = useGlobalDrift();
  const retry = useRetryOperation();

  return (
    <GlobalTargets
      isLoading={deployState.isLoading}
      isError={deployState.isError}
      tools={deployState.data?.tools ?? []}
      skipped={deployState.data?.skipped ?? []}
      otherOrigins={deployState.data?.otherOrigins ?? []}
      pendingOperation={deployState.data?.pendingOperation}
      onRetryOperation={() => retry.mutate({ target: { kind: "global" } })}
      isRetryingOperation={retry.isPending}
      drift={driftViewModel(drift)}
      onStartDeploy={onStartDeploy}
    />
  );
}
