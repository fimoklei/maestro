import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfigUnreachableNotice } from "../inventory/config-unreachable-notice";
import { useInventoryConfig } from "../inventory/use-inventory";
import { RegisterRepoForm } from "../registry/register-repo-form";
import { useRegisterRepos } from "../registry/use-register-repos";
import { useRegisterRepo, useRegistry } from "../registry/use-registry";
import { BrowseDialog } from "../shell/browse-dialog";
import { useBrowsePicker } from "../shell/use-browse-picker";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";
import { WizardProgress } from "./wizard-progress";

// The wizard's register step (issue #97, design f1-repos): register the
// consuming repos deploys can land in. Reuses the existing registry
// endpoint/hooks — no new registration backend (PRD #93).
export function WizardReposView() {
  const registry = useRegistry();
  const register = useRegisterRepo();
  const navigate = useNavigate();
  const config = useInventoryConfig();
  const [path, setPath] = useState("");
  // Confirming the picker registers the whole selection here — the dialog only
  // hands over the paths (issue #151).
  const registerSelection = useRegisterRepos();
  const browse = useBrowsePicker((paths) =>
    registerSelection.registerRepos(paths),
  );
  const repos = registry.data?.repos ?? [];
  // Client-side join for the browse dialog's "● registered" badge (issue
  // #150) — the server stays registry-agnostic; this is a hint, not a
  // guarantee (a stale set just skips the badge, never blocks registration).
  const registeredPaths = useMemo(
    () => new Set(repos.map((repo) => repo.path)),
    [repos],
  );
  // Blocks a deep link/bookmark into this step by a still-unconfigured user —
  // the register step only makes sense after connect (the gate only guards
  // /welcome itself, not this nested route; see first-run-gate.tsx). The
  // mirror of the connect step's guard: there configured users are bounced,
  // here unconfigured ones. Users arriving through the wizard never hit the
  // pending branch — connect's onSuccess seeds the config cache synchronously
  // (use-connect-inventory.ts), so config resolves from cache.
  const blocked = config.isPending || !config.data?.inventoryPath;

  useEffect(() => {
    if (blocked && config.isSuccess) {
      navigate("/welcome", { replace: true });
    }
  }, [blocked, config.isSuccess, navigate]);

  function handleSubmit(submittedPath: string) {
    register.mutate(submittedPath, { onSuccess: () => setPath("") });
  }

  if (config.isError) {
    // The guard waits for a *successful* config answer to know whether this
    // user is configured; a failed query would otherwise hang on "Loading…".
    // Offer a readable error + retry instead (#103).
    return <ConfigUnreachableNotice onRetry={() => config.refetch()} />;
  }

  if (blocked) {
    return <p className="text-dim text-tag">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Register consuming repos"
        meta="step 2 of 3 · where local deploys can land"
      />
      <Card padded className="max-w-lg">
        <RegisterRepoForm
          path={path}
          onPathChange={setPath}
          onSubmit={handleSubmit}
          error={register.error ? (register.error as Error).message : null}
          // A selection registering repo-by-repo blocks the form too: both
          // paths write the same registry, and the run is the visible answer.
          isPending={register.isPending || registerSelection.isRegistering}
          onBrowse={browse.openBrowse}
        />
        {registerSelection.outcomes.length > 0 ? (
          <div className="flex flex-col gap-1 border-line-row border-t pt-3">
            <span className="m-label">Results of last selection</span>
            <ul
              aria-label="Registration results"
              className="flex flex-col gap-1"
            >
              {registerSelection.outcomes.map((outcome) => (
                <li
                  key={outcome.path}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span
                      className={
                        outcome.ok
                          ? "text-green-ink text-tag"
                          : "text-amber-ink text-tag"
                      }
                    >
                      {outcome.ok ? "✓" : "✕"}
                    </span>
                    <span className="truncate font-mono text-fg-2 text-mono-sm">
                      {outcome.path}
                    </span>
                  </span>
                  <span
                    className={`whitespace-nowrap font-mono text-tag ${
                      outcome.ok ? "text-green-ink" : "text-amber-ink"
                    }`}
                  >
                    {outcome.reason}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {repos.length > 0 ? (
          <ul aria-label="Registered repos" className="flex flex-col gap-1">
            {repos.map((repo) => (
              <li
                key={repo.path}
                className="flex items-baseline justify-between gap-2"
              >
                <span className="font-mono text-fg text-mono-sm">
                  {repo.path}
                </span>
                <span className="font-mono text-dim text-tag">registered</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
      <div>
        {repos.length > 0 ? (
          <Button variant="primary" size="sm" onClick={() => navigate("/")}>
            Continue to Deploy-state →
          </Button>
        ) : (
          <Button variant="quiet" size="sm" onClick={() => navigate("/")}>
            skip →
          </Button>
        )}
      </div>
      <WizardProgress activeStep={2} />
      {browse.open ? (
        <BrowseDialog
          mode="register"
          registeredPaths={registeredPaths}
          onSelect={browse.selectBrowse}
          onClose={browse.closeBrowse}
        />
      ) : null}
    </div>
  );
}
