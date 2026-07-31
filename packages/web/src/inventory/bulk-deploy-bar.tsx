import { useState } from "react";
import { useDeployState } from "../deploy-state/use-deploy-state";
import { useGlobalDeployState } from "../deploy-state/use-global-deploy-state";
import { driftViewModel } from "../drift/drift-view-model";
import { useDrift, useGlobalDrift } from "../drift/use-drift";
import type { RegisteredRepo } from "../registry/use-registry";
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
// comes back as an attention row with an inline force reinstall.
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
  // Reuses the single-deploy path with force: true — one behaviour, both
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
  const targetLabel = isGlobal ? "Global" : selected;

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
    targetLabel,
    target,
    globalTools: globalDeployState.data?.tools,
    repoPrimitives: repoDeployState.data?.primitives,
    drift,
  });

  const selectId = "bulk-deploy-target";
  const buttonLabel = !registryReady
    ? "Loading targets…"
    : bulk.isPending
      ? "Deploying…"
      : `Deploy ${stagedNames.length} →`;

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
        updateToLatest: plan.updateToLatest,
        targetLabel,
        requestFailed: bulk.isError,
        requestFailedMessage: bulk.error?.message,
      })
    : null;

  return (
    // Two separate announcements: nesting the report's status inside the
    // count's live region would give assistive tech a region within a region.
    <div className="mx-card-x mb-row-y flex flex-col gap-row-y rounded-control border border-line bg-inset px-card-x py-row-y text-fg text-mono-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span
          role="status"
          aria-label="Bulk selection"
          className="flex flex-wrap items-center gap-2 font-mono"
        >
          {stagedNames.length} staged for bulk
          {hiddenCount > 0 ? (
            <span className="text-muted text-tag">
              · {hiddenCount} hidden by the filter
            </span>
          ) : null}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <label htmlFor={selectId} className="sr-only">
            Bulk-deploy target
          </label>
          <select
            id={selectId}
            value={selected}
            onChange={(event) => {
              bulk.reset();
              setPlan(null);
              setChosen(event.target.value);
            }}
            className="max-w-40 truncate rounded-control border border-line-chip bg-transparent px-2 py-[3px] font-mono text-muted text-tag"
          >
            <option value={GLOBAL_VALUE} disabled={globalDisabled}>
              {globalOptionLabel(globalTools)}
            </option>
            {repos.map((repo) => (
              <option key={repo.path} value={repo.path}>
                {repo.path}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="sm"
            disabled={
              !registryReady ||
              targetLoading ||
              bulk.isPending ||
              globalUnavailable ||
              stagedNames.length === 0
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
          onForce={(name) =>
            forceDeploy.mutate({ type: "skill", name, target, force: true })
          }
        />
      ) : null}
    </div>
  );
}
