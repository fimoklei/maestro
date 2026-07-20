import { RegisterRepoHint } from "../registry/register-repo-hint";
import { useRegistry } from "../registry/use-registry";
import { SectionHeader } from "../ui/section-header";
import { DeployStatePanel } from "./deploy-state-panel";
import { GlobalDeployStatePanel } from "./global-deploy-state-panel";
import { useGlobalDeployState } from "./use-global-deploy-state";

// The Deploy-state view body: a SectionHeader over a grid of target cards — the
// detected Global cards plus one card per registered repo. It reuses server
// state (TanStack Query dedupes the shared keys), so a newly registered repo or
// detected tool updates the count without a reload.
export function DeployStateSection() {
  const registry = useRegistry();
  const globalDeployState = useGlobalDeployState();
  const repos = registry.data?.repos ?? [];
  const targetCount =
    (globalDeployState.data?.tools.length ?? 0) + repos.length;

  return (
    <section>
      <SectionHeader
        title="Deploy-state"
        meta={`read from lockfiles · ${targetCount} ${
          targetCount === 1 ? "target" : "targets"
        }`}
      />
      {/* Global fans out to one card per detected tool (ADR-0011), so it renders
          its own "GLOBAL TARGETS" sub-section above the per-repo grid rather than
          sitting as a single grid cell. */}
      <GlobalDeployStatePanel />
      {repos.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {repos.map((repo) => (
            <DeployStatePanel key={repo.path} repo={repo.path} />
          ))}
        </div>
      ) : null}
      {/* Only on a proven-empty registry — a pending or failed read yields the
          same empty list, and both are already reported below. */}
      {registry.isSuccess && repos.length === 0 ? (
        <RegisterRepoHint className="mt-3 block" />
      ) : null}
      {registry.isLoading ? (
        <p className="mt-3 text-dim text-tag">Loading registered repos…</p>
      ) : registry.isError ? (
        // A failed registry read must surface as an error, never collapse into
        // "no repos registered" — that would hide a broken read indefinitely.
        <p role="alert" className="mt-3 text-amber-ink text-tag">
          Could not load registered repos.
        </p>
      ) : null}
    </section>
  );
}
