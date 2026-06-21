import { Link } from "react-router-dom";
import { useRegistry } from "../registry/use-registry";
import { DeployStateSection } from "./deploy-state-section";
import { useGlobalDeployState } from "./use-global-deploy-state";

// The landing view: deploy-state across the global target and every registered
// repo, with the deployed -> latest version pair and one-action update per
// behind skill. On a genuine cold start — nothing deployed globally and no repos
// registered — it nudges the first deploy instead of leaving a blank dead-end.
export function DeployStateView() {
  const global = useGlobalDeployState();
  const registry = useRegistry();

  const isColdStart =
    global.isSuccess &&
    (global.data?.primitives.length ?? 0) === 0 &&
    (global.data?.skipped.length ?? 0) === 0 &&
    registry.isSuccess &&
    (registry.data?.repos.length ?? 0) === 0;

  return (
    <>
      {isColdStart ? <ColdStartNudge /> : null}
      <DeployStateSection />
    </>
  );
}

function ColdStartNudge() {
  return (
    <div
      role="status"
      className="mb-3 flex flex-wrap items-center gap-x-1.5 rounded-card border border-line-dashed px-card-x py-row-y font-ui text-tag"
    >
      <span className="text-fg">Nothing deployed yet.</span>
      <span className="text-muted">
        Deploy your first skill from the{" "}
        <Link to="/inventory" className="text-amber-ink underline">
          Inventory
        </Link>
        .
      </span>
    </div>
  );
}
