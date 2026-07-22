import { toDeployedView } from "../deploy-state/deployed-view";
import { useDeployState } from "../deploy-state/use-deploy-state";
import { useGlobalDeployState } from "../deploy-state/use-global-deploy-state";
import { driftViewModel } from "../drift/drift-view-model";
import { useDrift, useGlobalDrift } from "../drift/use-drift";
import { useRegistry } from "../registry/use-registry";
import { TargetItem } from "./target-item";
import { targetLabel } from "./target-label";

// The sidebar Targets list: the global target (always present) plus one row per
// registered repo, each carrying its own drift state as a sync indicator. Each
// target owns its own drift query, so a behind target stands out without a
// reload — and an unverifiable check reads as "unknown", never as in sync. The
// roll-up joins drift against the target's deployed primitives so an
// orphan-behind (a behind name not deployed here) never reads as "drift".
export function TargetsList() {
  const registry = useRegistry();
  const repos = registry.data?.repos ?? [];

  // The whole registered set drives each label, so a repo's tail grows only far
  // enough to stay distinct from its siblings (#211).
  const repoPaths = repos.map((repo) => repo.path);

  return (
    <ul aria-label="Targets">
      <GlobalTargetItem />
      {repos.map((repo) => (
        <RepoTargetItem key={repo.path} repo={repo.path} siblings={repoPaths} />
      ))}
    </ul>
  );
}

function GlobalTargetItem() {
  const drift = driftViewModel(useGlobalDrift());
  const deployState = useGlobalDeployState();
  return (
    <TargetItem
      label="Global"
      kind="global"
      indicator={drift.targetIndicator(toDeployedView(deployState))}
    />
  );
}

function RepoTargetItem({
  repo,
  siblings,
}: {
  repo: string;
  siblings: string[];
}) {
  const drift = driftViewModel(useDrift(repo));
  const deployState = useDeployState(repo);
  return (
    <TargetItem
      label={targetLabel(repo, siblings)}
      title={repo}
      kind="local"
      indicator={drift.targetIndicator(toDeployedView(deployState))}
    />
  );
}
