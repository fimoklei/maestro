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
  const browse = useBrowsePicker((paths) => {
    // The form's own error belongs to a hand-typed path that is no longer
    // what the screen is about — leaving it would contradict the ticks the
    // batch is about to render underneath it.
    register.reset();
    registerSelection.registerRepos(paths);
  });
  const repos = registry.data?.repos ?? [];
  // Client-side join for the browse dialog's "● registered" badge (issue
  // #150) — the server stays registry-agnostic; this is a hint, not a
  // guarantee (a stale set just skips the badge, never blocks registration).
  const registeredPaths = useMemo(
    () => new Set(repos.map((repo) => repo.path)),
    [repos],
  );
  // One list, not two. The registry is the spine: every registered repo gets a
  // row, and a row that was part of the last selection carries that repo's
  // outcome instead of the plain note. A failed repo never reached the
  // registry, so it has no row to decorate and earns its own at the end.
  const rows = useMemo(() => {
    const byPath = new Map(
      registerSelection.outcomes.map((outcome) => [outcome.path, outcome]),
    );
    return [
      ...repos.map((repo) => ({
        path: repo.path,
        outcome: byPath.get(repo.path),
      })),
      // Only a failure with no row of its own: a path still in the registry
      // (a repo since deleted off disk, re-registered and refused) already
      // carries its outcome above, and appending it again would list the same
      // repo twice.
      ...registerSelection.outcomes
        .filter((outcome) => !outcome.ok && !registeredPaths.has(outcome.path))
        .map((outcome) => ({ path: outcome.path, outcome })),
    ];
  }, [repos, registeredPaths, registerSelection.outcomes]);
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
        {rows.length > 0 ? (
          <ul aria-label="Registered repos" className="flex flex-col gap-1">
            {rows.map((row) => (
              <li
                key={row.path}
                className="flex items-baseline justify-between gap-2"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  {row.outcome ? (
                    <span
                      className={
                        row.outcome.ok
                          ? "text-green-ink text-tag"
                          : "text-amber-ink text-tag"
                      }
                    >
                      {row.outcome.ok ? "✓" : "✕"}
                    </span>
                  ) : null}
                  <span className="truncate font-mono text-fg text-mono-sm">
                    {row.path}
                  </span>
                </span>
                <span
                  className={`whitespace-nowrap font-mono text-tag ${
                    row.outcome && !row.outcome.ok
                      ? "text-amber-ink"
                      : "text-dim"
                  }`}
                >
                  {row.outcome ? row.outcome.reason : "registered"}
                </span>
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
