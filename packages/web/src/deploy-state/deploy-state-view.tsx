import { useNavigate } from "react-router-dom";
import { RegisterRepoHint } from "../registry/register-repo-hint";
import { useRegistry } from "../registry/use-registry";
import { Button } from "../ui/button";
import { SectionHeader } from "../ui/section-header";
import { DeployStatePanel } from "./deploy-state-panel";
import { GlobalDeployStatePanel } from "./global-deploy-state-panel";
import { useGlobalDeployState } from "./use-global-deploy-state";

// The landing view: deploy-state across every detected global target and every
// registered repo, with the deployed -> latest version pair and one-action
// update per behind skill. It reuses server state (TanStack Query dedupes the
// shared keys), so a newly registered repo or detected tool updates the count
// without a reload.
//
// On a genuine cold start — nothing deployed anywhere and no repo registered —
// the view offers the first deploy from its own heading row rather than a
// banner above the title, and its meta says so plainly instead of counting
// targets that hold nothing.
export function DeployStateView() {
  const navigate = useNavigate();
  const registry = useRegistry();
  const globalDeployState = useGlobalDeployState();
  const repos = registry.data?.repos ?? [];

  // A count is only honest once both reads have landed: until then an empty
  // list means "not known yet", not "nothing there". Same reason the cold start
  // demands both — inviting a first deploy off the back of a failed read would
  // be the cockpit guessing.
  const isRead = globalDeployState.isSuccess && registry.isSuccess;
  const isColdStart =
    isRead &&
    globalDeployState.data?.primitives.length === 0 &&
    globalDeployState.data?.skipped.length === 0 &&
    repos.length === 0;
  const targetCount =
    (globalDeployState.data?.tools.length ?? 0) + repos.length;

  return (
    <>
      <section>
        <SectionHeader
          title="Deploy-state"
          meta={`read from lockfiles${
            isColdStart
              ? " · nothing deployed"
              : isRead
                ? ` · ${targetCount} ${targetCount === 1 ? "target" : "targets"}`
                : ""
          }`}
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
        {/* Global fans out to one card per detected tool (ADR-0011), so it
            renders its own "GLOBAL TARGETS" sub-section. */}
        <GlobalDeployStatePanel />
      </section>
      <RepositoriesSection />
    </>
  );
}

// Registered repos are their own section, not a footnote under Global targets:
// the two target kinds are peers, so they carry the same heading weight and the
// registration hint sits under the heading it belongs to. It reads the registry
// itself rather than taking it apart into props — Query dedupes the shared key
// with the view above (frontend.md).
function RepositoriesSection() {
  const { data, isLoading, isError, isSuccess } = useRegistry();
  const repos = data?.repos ?? [];

  return (
    <section className="mt-section">
      <SectionHeader
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
            <DeployStatePanel key={repo.path} repo={repo.path} />
          ))}
        </div>
      ) : null}
      {/* Only on a proven-empty registry — a pending or failed read yields the
          same empty list, and both are already reported below. */}
      {isSuccess && repos.length === 0 ? (
        <RegisterRepoHint className="block" />
      ) : null}
      {isLoading ? (
        <p className="text-dim text-tag">Loading registered repos…</p>
      ) : isError ? (
        // A failed registry read must surface as an error, never collapse into
        // "no repos registered" — that would hide a broken read indefinitely.
        <p role="alert" className="text-amber-ink text-tag">
          Could not load registered repos.
        </p>
      ) : null}
    </section>
  );
}
