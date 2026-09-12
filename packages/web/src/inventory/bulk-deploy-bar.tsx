import { useState } from "react";
import { useDeployState } from "../deploy-state/use-deploy-state";
import { useGlobalDeployState } from "../deploy-state/use-global-deploy-state";
import { driftViewModel } from "../drift/drift-view-model";
import { useDrift, useGlobalDrift } from "../drift/use-drift";
import type { RegisteredRepo } from "../registry/use-registry";
import { targetLabel } from "../shell/target-label";
import { Button } from "../ui/button";
import { BulkDeployReport } from "./bulk-deploy-report";
import { bulkDeployReportView } from "./bulk-deploy-report-view";
import { chosenBulkDeployTargets } from "./bulk-deploy-targets";
import { globalOptionLabel } from "./global-option-label";
import { type BulkDeployPlan, planBulkDeploy } from "./plan-bulk-deploy";
import { useBulkDeploy } from "./use-bulk-deploy";
import { type DeployTarget, useDeploySkill } from "./use-deploy-skill";

// Bulk-deploy control (#291, #292): plans → executes → reports over the
// staged set. Skips already-deployed-and-up-to-date skills; a diverged copy
// comes back as an attention row with an inline force reinstall. Mounted only
// while something is staged, so it never stands empty.
const GLOBAL_VALUE = "global";

export function BulkDeployBar({
  stagedNames,
  hiddenCount,
  repos,
  registryReady,
}: {
  stagedNames: string[];
  hiddenCount: number;
  repos: RegisteredRepo[];
  registryReady: boolean;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [plan, setPlan] = useState<BulkDeployPlan | null>(null);
  const bulk = useBulkDeploy();
  // Reuses the single-deploy path with the row's own receipt — one behaviour,
  // entry points (ADR-0006, #66).
  const forceDeploy = useDeploySkill();

  const isKnown =
    chosen === GLOBAL_VALUE || repos.some((repo) => repo.path === chosen);
  const selected = isKnown
    ? (chosen as string)
    : (repos[0]?.path ?? GLOBAL_VALUE);
  const isGlobal = selected === GLOBAL_VALUE;
  const target: DeployTarget = isGlobal
    ? { kind: "global" }
    : { kind: "repo", repoPath: selected };
  // Shortened like every other target name in the cockpit (#211) — the
  // absolute path pushes the outcome off its own row.
  const repoPaths = repos.map((repo) => repo.path);
  const chosenLabel = isGlobal ? "Global" : targetLabel(selected, repoPaths);

  const repoDeployState = useDeployState(
    isGlobal ? "" : selected,
    registryReady && !isGlobal,
  );
  const globalDeployState = useGlobalDeployState(registryReady);
  const repoDrift = useDrift(
    isGlobal ? "" : selected,
    registryReady && !isGlobal,
  );
  const globalDrift = useGlobalDrift(registryReady && isGlobal);
  const deployState = isGlobal ? globalDeployState : repoDeployState;
  const rawDrift = isGlobal ? globalDrift : repoDrift;
  const drift = driftViewModel(rawDrift);
  // The plan waits rather than guessing, or every skill reads "not deployed"
  // and gets sent for a pointless reinstall (J04).
  const targetLoading =
    registryReady &&
    (deployState.data === undefined || rawDrift.data === undefined);

  const globalTools = globalDeployState.data?.detectedTools;
  const globalDisabled = globalTools !== undefined && globalTools.length === 0;
  const globalUnavailable = isGlobal && globalDisabled;

  const chosenTargets = chosenBulkDeployTargets({
    isGlobal,
    targetLabel: chosenLabel,
    target,
    globalTools: globalDeployState.data?.tools,
    repoPrimitives: repoDeployState.data?.primitives,
    drift,
  });

  const selectId = "bulk-deploy-target";
  const buttonLabel = !registryReady
    ? "Loading targets…"
    : bulk.isPending
      ? "Deploying skills…"
      : `Deploy ${stagedNames.length} ${stagedNames.length === 1 ? "skill" : "skills"}`;

  const onDeploy = () => {
    if (targetLoading) {
      return;
    }
    bulk.reset();
    const next = planBulkDeploy(stagedNames, chosenTargets);
    setPlan(next);
    // A clean-and-latest-only plan is a no-op.
    if (next.toDeploy.length > 0) {
      bulk.mutate({ names: next.toDeploy, target });
    }
  };

  // Empty until bulk.data lands, so the skipped-clean plan still shows. A
  // failed request never falls back to this shape — it would read as a
  // confirmed "0 deployed" success (#292) — it takes the error branch instead.
  const report = bulk.data ?? {
    target,
    deployed: [],
    attention: [],
    failed: [],
  };
  const reportView = plan
    ? bulkDeployReportView({
        report,
        skippedClean: plan.skippedClean,
        targetLabel: chosenLabel,
        requestFailed: bulk.isError,
      })
    : null;

  return (
    // Two separate announcements: nesting the report's status inside the
    // count's live region would give assistive tech a region within a region.
    <div className="mx-card-x mb-row-y flex flex-col gap-row-y rounded-control border border-line bg-inset px-card-x py-row-y text-fg text-mono-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span
          role="status"
          aria-label="Staged for bulk deploy"
          className="flex flex-wrap items-center gap-2 font-mono"
        >
          {stagedNames.length} staged for bulk deploy
          {hiddenCount > 0 ? (
            <span className="text-muted text-tag">
              · {hiddenCount} hidden by the filter
            </span>
          ) : null}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <label htmlFor={selectId} className="sr-only">
            Deploy target for the staged skills
          </label>
          <select
            id={selectId}
            value={selected}
            onChange={(event) => {
              bulk.reset();
              setPlan(null);
              setChosen(event.target.value);
            }}
            className="max-w-64 truncate rounded-control border border-line-chip bg-transparent px-2 py-[3px] font-mono text-muted text-tag"
          >
            <option value={GLOBAL_VALUE} disabled={globalDisabled}>
              {globalOptionLabel(globalTools)}
            </option>
            {repos.map((repo) => (
              <option key={repo.path} value={repo.path}>
                {targetLabel(repo.path, repoPaths)}
              </option>
            ))}
          </select>
          <Button
            variant="primary"
            size="sm"
            disabled={
              !registryReady ||
              targetLoading ||
              bulk.isPending ||
              globalUnavailable
            }
            onClick={onDeploy}
          >
            {buttonLabel}
          </Button>
        </span>
      </div>

      {reportView ? (
        <BulkDeployReport
          view={reportView}
          isDeploying={bulk.isPending}
          onForce={(name, confirmedCopyReceipt) =>
            forceDeploy.mutate({
              type: "skill",
              name,
              target,
              confirmedCopyReceipt,
            })
          }
        />
      ) : null}
    </div>
  );
}
