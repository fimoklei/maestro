import { useState } from "react";
import { useDeployState } from "../deploy-state/use-deploy-state";
import { useGlobalDeployState } from "../deploy-state/use-global-deploy-state";
import { driftViewModel } from "../drift/drift-view-model";
import { useDrift, useGlobalDrift } from "../drift/use-drift";
import type { RegisteredRepo } from "../registry/use-registry";
import { Button } from "../ui/button";
import { BulkDeployReport } from "./bulk-deploy-report";
import { bulkDeployReportView } from "./bulk-deploy-report-view";
import type { DeploymentTarget } from "./deployed-rollup";
import { globalOptionLabel } from "./global-option-label";
import { type BulkDeployPlan, planBulkDeploy } from "./plan-bulk-deploy";
import { useBulkDeploy } from "./use-bulk-deploy";
import { type DeployTarget, useDeploySkill } from "./use-deploy-skill";

// The bulk-deploy control: it sits above the table once skills are staged (#291)
// and pushes them all to one chosen target in a single action (#292). It mirrors
// DeploySkillAction's target picker, but plans → executes → reports over the
// staged set. The plan skips a skill already deployed and up-to-date (read from
// the cached deploy-state + drift); the rest go to the server, which never
// aborts on a failure. A diverged copy comes back as an attention row with an
// inline force reinstall.

// The select value for the global target; a repo's value is its absolute path,
// which can never collide with this literal (mirrors DeploySkillAction).
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
  // Per-item force reuses the single-deploy path with force: true — one deploy
  // behaviour, both entry points (ADR-0006, #66), and it refreshes the same
  // deploy-state/drift queries.
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
  const drift = driftViewModel(isGlobal ? globalDrift : repoDrift);

  const globalTools = globalDeployState.data?.detectedTools;
  const globalDisabled = globalTools !== undefined && globalTools.length === 0;
  const globalUnavailable = isGlobal && globalDisabled;

  // The chosen target folded into the shape planBulkDeploy reads: its deployed
  // names (once the local read resolves) and its drift view-model. A still-
  // loading read stays "pending", so a skill is attempted rather than assumed
  // clean.
  const primitives = deployState.data?.primitives ?? [];
  const chosenTarget: DeploymentTarget = {
    label: targetLabel,
    deployed:
      deployState.data === undefined
        ? { status: "pending" }
        : {
            status: "ready",
            names: primitives.map((primitive) => primitive.name),
            skippedCount: 0,
          },
    primitives,
    drift,
  };

  const selectId = "bulk-deploy-target";
  const buttonLabel = !registryReady
    ? "Loading targets…"
    : bulk.isPending
      ? "Deploying…"
      : `Deploy ${stagedNames.length} →`;

  const onDeploy = () => {
    bulk.reset();
    const next = planBulkDeploy(stagedNames, chosenTarget);
    setPlan(next);
    // A clean-and-latest-only plan is a no-op: show the skipped report without
    // troubling the server.
    if (next.toDeploy.length > 0) {
      bulk.mutate({ names: next.toDeploy, target });
    }
  };

  // Until the batch resolves, the report reads from an empty server result so
  // the skipped-clean plan still shows; bulk.data replaces it on success.
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
        targetLabel,
      })
    : null;

  return (
    <div
      role="status"
      aria-label="Bulk selection"
      className="mx-card-x mb-row-y flex flex-col gap-row-y rounded-control border border-line bg-inset px-card-x py-row-y text-fg text-mono-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono">{stagedNames.length} staged for bulk</span>
        {hiddenCount > 0 ? (
          <span className="text-muted text-tag">
            · {hiddenCount} hidden by the filter
          </span>
        ) : null}
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
