import { driftViewModel } from "../drift/drift-view-model";
import { useGlobalDrift } from "../drift/use-drift";
import { GlobalTargets } from "./global-targets";
import { toolNameList } from "./tool-labels";
import { UpdateTargetAction } from "./update-target-action";
import { useGlobalDeployState } from "./use-global-deploy-state";
import { useRetryOperation } from "./use-retry-operation";
import { useUpdateTarget } from "./use-update-target";

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
  const update = useUpdateTarget();
  const tools = deployState.data?.tools ?? [];
  const pending = deployState.data?.pendingOperation;
  // One lockfile, one release: any card reading behind puts the whole global
  // target behind. An unfinished operation is converged first (#951).
  const behind =
    pending === undefined &&
    tools.some(
      (group) =>
        group.releaseHead !== undefined &&
        group.releaseHead.latestRelease !== null &&
        group.releaseHead.latestRelease !== group.releaseHead.release,
    );

  return (
    <GlobalTargets
      isLoading={deployState.isLoading}
      isError={deployState.isError}
      tools={tools}
      skipped={deployState.data?.skipped ?? []}
      otherOrigins={deployState.data?.otherOrigins ?? []}
      pendingOperation={pending}
      onRetryOperation={() => retry.mutate({ target: { kind: "global" } })}
      isRetryingOperation={retry.isPending}
      isUpdating={update.isPending}
      updateAction={
        behind || update.data !== undefined || update.isError ? (
          // Named by the tools it covers: one Update moves the whole detected
          // set (spec story 32).
          <UpdateTargetAction
            targetName={toolNameList(tools.map((group) => group.tool))}
            target={{ kind: "global" }}
            update={update}
            offered={behind}
          />
        ) : null
      }
      drift={driftViewModel(drift)}
      onStartDeploy={onStartDeploy}
    />
  );
}
