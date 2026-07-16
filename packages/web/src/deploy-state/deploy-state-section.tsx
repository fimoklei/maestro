import { useRegistry } from "../registry/use-registry";
import { SectionHeader } from "../ui/section-header";
import { DeployStatePanel } from "./deploy-state-panel";
import { GlobalDeployStatePanel } from "./global-deploy-state-panel";

// The Deploy-state view body: a SectionHeader over a grid of target cards — the
// fixed Global card (the baseline, always present) plus one card per registered
// repo. It reuses the registry server-state (TanStack Query dedupes the shared
// key with the sidebar Targets list), so a newly registered repo gets its own
// card without a reload.
export function DeployStateSection() {
  const registry = useRegistry();
  const repos = registry.data?.repos ?? [];
  const targetCount = 1 + repos.length;

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
