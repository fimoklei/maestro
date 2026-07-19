import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ConfigUnreachableNotice } from "../inventory/config-unreachable-notice";
import { useInventoryConfig } from "../inventory/use-inventory";
import { BrowseDialog } from "../shell/browse-dialog";
import { useRegisterPicker } from "../shell/use-register-picker";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";
import { WizardProgress } from "./wizard-progress";

// The wizard's register step (issue #97, design f1-repos): register the
// consuming repos deploys can land in. Reuses the existing registry
// endpoint/hooks — no new registration backend (PRD #93).
//
// One button, one list (issue #175). The step has no path field of its own:
// the picker's paste field already takes a hand-typed absolute path, including
// one outside the home directory that browsing cannot reach. Nor does it
// report on a run — the picker keeps its own outcomes on screen until the user
// dismisses them, and what lands here is simply the repos that registered.
// This deliberately departs from design frame f1-repos, which still draws the
// path field.
export function WizardReposView() {
  const navigate = useNavigate();
  const config = useInventoryConfig();
  // Confirming the picker registers the whole selection here — the dialog only
  // hands over the paths (issue #151) and then reports what came back. The
  // sidebar mounts the same picker through the same hook (issue #163).
  const picker = useRegisterPicker();
  const repos = picker.repos;
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
      <Card padded className="flex max-w-lg flex-col gap-3">
        <Button
          variant="dashed"
          size="md"
          onClick={picker.openPicker}
          className="self-start"
        >
          + repo
        </Button>
        {repos.length > 0 ? (
          <ul aria-label="Registered repos" className="flex flex-col gap-1">
            {repos.map((repo) => (
              <li
                key={repo.path}
                className="flex items-baseline justify-between gap-2"
              >
                <span className="truncate font-mono text-fg text-mono-sm">
                  {repo.path}
                </span>
                <span className="whitespace-nowrap font-mono text-dim text-tag">
                  registered
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
      {picker.open ? <BrowseDialog {...picker.dialogProps} /> : null}
    </div>
  );
}
