import { DeployStateList } from "./deploy-state-list";
import { useDeployState } from "./use-deploy-state";

// Container: wires one repo's deploy-state server-state hook to the
// presentational list. A failed read (e.g. a malformed lockfile) gets a visible
// error — an empty list must never stand in for "I couldn't read this".
export function DeployStatePanel({ repo }: { repo: string }) {
  const deployState = useDeployState(repo);

  return (
    <section>
      <h3>{repo}</h3>
      {deployState.isLoading ? (
        <p>Loading…</p>
      ) : deployState.isError ? (
        <p role="alert">Could not read this repo's deploy-state.</p>
      ) : (
        <DeployStateList
          primitives={deployState.data?.primitives ?? []}
          skipped={deployState.data?.skipped ?? []}
        />
      )}
    </section>
  );
}
