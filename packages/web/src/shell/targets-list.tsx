import {
  toDeployedView,
  toolDeployedView,
} from "../deploy-state/deployed-view";
import { toolPresentation } from "../deploy-state/tool-presentation";
import { useDeployState } from "../deploy-state/use-deploy-state";
import {
  type ToolDeployState,
  useGlobalDeployState,
} from "../deploy-state/use-global-deploy-state";
import { type DriftViewModel, driftViewModel } from "../drift/drift-view-model";
import { useDrift, useGlobalDrift } from "../drift/use-drift";
import { useRegistry } from "../registry/use-registry";
import { TargetItem } from "./target-item";
import { targetLabel } from "./target-label";

// The sidebar Targets list: one row per detected tool (Claude Code, Codex, …)
// plus one row per registered repo, replacing the old single "Global" row. Each
// row carries a `▲N` drift badge (N = skills deployed there and behind), joining
// drift against the target's deployed primitives so an orphan-behind (a behind
// name not deployed here) never inflates N — and an unverifiable check reads as
// "unknown", never as in sync (J04).
export function TargetsList() {
  const registry = useRegistry();
  const repos = registry.data?.repos ?? [];

  // One global drift check, narrowed per tool with forTool — the same single
  // check the global-targets cards read, so a skill behind on another tool never
  // spills onto this one.
  const globalDrift = driftViewModel(useGlobalDrift());
  const globalDeploy = useGlobalDeployState();
  const tools = globalDeploy.data?.tools ?? [];

  // The whole registered set drives each label, so a repo's tail grows only far
  // enough to stay distinct from its siblings (#211).
  const repoPaths = repos.map((repo) => repo.path);

  // The read-state behind the tool rows: a failed refetch keeps stale tool data,
  // so each row must know the read errored and drop to "unknown" (J04), never
  // read a cached name as in sync.
  const toolsRead = {
    data: globalDeploy.data,
    isError: globalDeploy.isError,
  };

  // Until the global read has produced any tool data, one placeholder row keeps
  // the global state visible: "checking…" while it loads, "unknown" if it fails.
  // A bare empty list would read as "no global targets", hiding both — the honest
  // states the old permanent Global row used to carry (J03/J04).
  const detecting = globalDeploy.data === undefined;

  return (
    <ul aria-label="Targets">
      {detecting ? (
        <TargetItem
          label="Global targets"
          kind="global"
          indicator={globalDeploy.isError ? "unknown" : "pending"}
        />
      ) : (
        tools.map((group) => (
          <ToolTargetItem
            key={group.tool}
            group={group}
            drift={globalDrift}
            read={toolsRead}
          />
        ))
      )}
      {repos.map((repo) => (
        <RepoTargetItem key={repo.path} repo={repo.path} siblings={repoPaths} />
      ))}
    </ul>
  );
}

function ToolTargetItem({
  group,
  drift,
  read,
}: {
  group: ToolDeployState;
  drift: DriftViewModel;
  read: { data: unknown; isError: boolean };
}) {
  const names = group.primitives.map((primitive) => primitive.name);
  const toolDrift = drift.forTool(names);
  const deployed = toolDeployedView(names, read);
  return (
    <TargetItem
      label={toolPresentation(group.tool).label}
      kind="global"
      indicator={toolDrift.targetIndicator(deployed)}
      driftCount={toolDrift.driftCount(deployed)}
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
  const deployed = toDeployedView(deployState);
  return (
    <TargetItem
      label={targetLabel(repo, siblings)}
      title={repo}
      kind="local"
      indicator={drift.targetIndicator(deployed)}
      driftCount={drift.driftCount(deployed)}
    />
  );
}
