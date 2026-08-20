import { useNavigate } from "react-router";
import { RegisterRepoHint } from "../registry/register-repo-hint";
import { useRegistry } from "../registry/use-registry";
import { Notice } from "../ui/notice";
import { SectionHeader } from "../ui/section-header";
import { DeployStatePanel } from "./deploy-state-panel";
import { GlobalDeployStatePanel } from "./global-deploy-state-panel";
import { useGlobalDeployState } from "./use-global-deploy-state";

// The landing view: deploy-state across every global target and registered
// repo. On a genuine cold start, its meta states "nothing deployed" plainly.
export function DeployStateView() {
  const navigate = useNavigate();
  const registry = useRegistry();
  const globalDeployState = useGlobalDeployState();
  const repos = registry.data?.repos ?? [];

  // Only honest once both reads have landed — until then, empty means "not
  // known yet", not "nothing there".
  const isRead = globalDeployState.isSuccess && registry.isSuccess;
  const isColdStart =
    isRead &&
    globalDeployState.data?.primitives.length === 0 &&
    globalDeployState.data?.skipped.length === 0 &&
    repos.length === 0;
  const targetCount =
    (globalDeployState.data?.tools.length ?? 0) + repos.length;

  return (
    <section>
      <SectionHeader
        title="Deploy-state"
        meta={
          isColdStart
            ? "nothing deployed"
            : isRead
              ? `${targetCount} ${targetCount === 1 ? "target" : "targets"}`
              : ""
        }
      />
      <GlobalDeployStatePanel onStartDeploy={() => navigate("/inventory")} />
      <RepositoriesSection onStartDeploy={() => navigate("/inventory")} />
    </section>
  );
}

// Own sub-section, not a footnote under Global targets. Reads the registry
// itself — Query dedupes the shared key with the view above (frontend.md).
function RepositoriesSection({ onStartDeploy }: { onStartDeploy: () => void }) {
  const { data, isLoading, isError, isSuccess } = useRegistry();
  const repos = data?.repos ?? [];
  // Whole set drives each label so shared-prefix repos stay distinct (#211).
  const repoPaths = repos.map((repo) => repo.path);

  return (
    <section className="mt-section">
      <SectionHeader
        level={3}
        title="Repositories"
        // No meta on an empty registry: RegisterRepoHint below already states
        // it, and the two lines would sit two rows apart.
        meta={
          isSuccess && repos.length > 0
            ? `${repos.length} registered`
            : undefined
        }
      />
      {repos.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {repos.map((repo) => (
            <DeployStatePanel
              key={repo.path}
              repo={repo.path}
              siblings={repoPaths}
              onStartDeploy={onStartDeploy}
            />
          ))}
        </div>
      ) : null}
      {/* Only on a proven-empty registry — pending/failed reads yield the same
          empty list and are reported below instead. */}
      {isSuccess && repos.length === 0 ? (
        <RegisterRepoHint className="block" />
      ) : null}
      {isLoading ? (
        <p className="text-dim text-tag">Loading registered repos…</p>
      ) : isError ? (
        <Notice
          trigger="load"
          notice={{
            level: "error",
            label: "the registered repos could not be loaded",
            message: "Reload the page to run the read again.",
          }}
        />
      ) : null}
    </section>
  );
}
