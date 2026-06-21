import { toDriftView } from "../drift/drift-query-view";
import { targetDriftIndicator } from "../drift/target-drift-indicator";
import { useDrift, useGlobalDrift } from "../drift/use-drift";
import { useRegistry } from "../registry/use-registry";
import { TargetItem } from "./target-item";

// The sidebar Targets list: the global target (always present) plus one row per
// registered repo, each carrying its own drift state as a sync indicator. Each
// target owns its own drift query, so a behind target stands out without a
// reload — and an unverifiable check reads as "unknown", never as in sync.
export function TargetsList() {
  const registry = useRegistry();
  const repos = registry.data?.repos ?? [];

  return (
    <ul aria-label="Targets">
      <GlobalTargetItem />
      {repos.map((repo) => (
        <RepoTargetItem key={repo.path} repo={repo.path} />
      ))}
    </ul>
  );
}

function GlobalTargetItem() {
  const drift = useGlobalDrift();
  return (
    <TargetItem
      label="Global"
      kind="global"
      indicator={targetDriftIndicator(toDriftView(drift))}
    />
  );
}

function RepoTargetItem({ repo }: { repo: string }) {
  const drift = useDrift(repo);
  return (
    <TargetItem
      label={repo}
      kind="local"
      indicator={targetDriftIndicator(toDriftView(drift))}
    />
  );
}
