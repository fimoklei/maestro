import type { DriftView } from "../drift/drift-status";
import { useDrift } from "../drift/use-drift";
import { DeployStateList } from "./deploy-state-list";
import { useDeployState } from "./use-deploy-state";

// Maps the drift query's state to the view-state the list consumes. A request
// failure (or a 4xx) becomes "unknown", never up-to-date — the same honesty the
// server keeps when its { ok: false } body says the check could not run.
function toDriftView(drift: ReturnType<typeof useDrift>): DriftView {
  if (drift.isError) {
    return { status: "unknown" };
  }
  if (drift.data === undefined) {
    return { status: "pending" };
  }
  // The check ran iff the body carries a behind set; { ok: false } means it
  // could not run — shown as unknown, never up-to-date.
  if ("behind" in drift.data) {
    return { status: "ready", behind: drift.data.behind };
  }
  return { status: "unknown" };
}

// Container: wires one repo's deploy-state and drift server-state hooks to the
// presentational list. They are two separate queries — the skill list renders
// as soon as deploy-state arrives, and each skill's drift badge fills in when
// the drift check resolves. A failed deploy-state read (e.g. a malformed
// lockfile) gets a visible error — an empty list must never stand in for "I
// couldn't read this".
export function DeployStatePanel({ repo }: { repo: string }) {
  const deployState = useDeployState(repo);
  const drift = useDrift(repo);

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
          drift={toDriftView(drift)}
        />
      )}
    </section>
  );
}
