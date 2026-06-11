import { useRegistry } from "../registry/use-registry";
import { DeployStatePanel } from "./deploy-state-panel";
import { GlobalDeployStatePanel } from "./global-deploy-state-panel";

// Container: a fixed Global panel (the baseline, always present) above one
// deploy-state panel per registered repo. It reuses the registry server-state
// (TanStack Query dedupes the shared key with RegistryPanel), so a newly
// registered repo gets its own deploy-state panel without a reload.
export function DeployStateSection() {
  const registry = useRegistry();
  const repos = registry.data?.repos ?? [];

  return (
    <section>
      <h2>Deploy-state</h2>
      <GlobalDeployStatePanel />
      {registry.isLoading ? (
        <p>Loading registered repos…</p>
      ) : registry.isError ? (
        // A failed registry read must surface as an error, never collapse into
        // "no repos registered" — that would hide a broken read indefinitely.
        <p role="alert">Could not load registered repos.</p>
      ) : repos.length === 0 ? (
        <p>Register a repo to see what is deployed in it.</p>
      ) : (
        repos.map((repo) => (
          <DeployStatePanel key={repo.path} repo={repo.path} />
        ))
      )}
    </section>
  );
}
