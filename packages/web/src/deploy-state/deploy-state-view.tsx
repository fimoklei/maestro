import { useNavigate } from "react-router";
import { RegisterRepoHint } from "../registry/register-repo-hint";
import { useRegistry } from "../registry/use-registry";
import { Button } from "../ui/button";
import { SectionHeader } from "../ui/section-header";
import { DeployStatePanel } from "./deploy-state-panel";
import { GlobalDeployStatePanel } from "./global-deploy-state-panel";
import { useGlobalDeployState } from "./use-global-deploy-state";

// The landing view: deploy-state across every global target and registered
// repo. On a genuine cold start, offers the first deploy from its own heading
// row rather than a banner, with meta stating "nothing deployed" plainly.
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
      >
        {isColdStart ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/inventory")}
          >
            deploy a skill →
          </Button>
        ) : null}
      </SectionHeader>
      <GlobalDeployStatePanel />
      <RepositoriesSection />
    </section>
  );
}

// Own sub-section, not a footnote under Global targets. Reads the registry
// itself — Query dedupes the shared key with the view above (frontend.md).
function RepositoriesSection() {
  const { data, isLoading, isError, isSuccess } = useRegistry();
  const repos = data?.repos ?? [];
  // Whole set drives each label so shared-prefix repos stay distinct (#211).
  const repoPaths = repos.map((repo) => repo.path);

  return (
    <section className="mt-section">
      <SectionHeader
        level={3}
        title="Repositories"
        meta={
          isSuccess
            ? repos.length === 0
              ? "none registered"
              : `${repos.length} registered`
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
        <p role="alert" className="text-amber-ink text-tag">
          Could not load registered repos. Reload the page to try again.
        </p>
      ) : null}
    </section>
  );
}
