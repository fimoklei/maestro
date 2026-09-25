import { useState } from "react";
import { deployNotice } from "../deploy-state/notice-copy";
import { toolNameList } from "../deploy-state/tool-labels";
import { UpdateTargetAction } from "../deploy-state/update-target-action";
import { useDeployState } from "../deploy-state/use-deploy-state";
import { useGlobalDeployState } from "../deploy-state/use-global-deploy-state";
import { useUpdateTarget } from "../deploy-state/use-update-target";
import { driftViewModel } from "../drift/drift-view-model";
import { useDrift, useGlobalDrift } from "../drift/use-drift";
import type { RegisteredRepo } from "../registry/use-registry";
import { targetLabel } from "../shell/target-label";
import { Button } from "../ui/button";
import { BulkDeployDialog } from "./bulk-deploy-dialog";
import {
  bulkDeployReportGroups,
  bulkDeployReportView,
  bulkDeploySummary,
} from "./bulk-deploy-report-view";
import { chosenBulkDeployTargets } from "./bulk-deploy-targets";
import { globalOptionLabel } from "./global-option-label";
import { bulkDeployDidNotRun, DEPLOY_SKILLS } from "./inventory-copy";
import { type BulkDeployPlan, planBulkDeploy } from "./plan-bulk-deploy";
import { useBulkDeploy } from "./use-bulk-deploy";
import { type DeployTarget, useDeploySkill } from "./use-deploy-skill";

type BulkDeployProps = {
  stagedNames: string[];
  repos: RegisteredRepo[];
  registryReady: boolean;
};

// The selection bar's **Deploy skills** and the dialog it opens (#291, #292).
export function BulkDeployAction(props: BulkDeployProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        {DEPLOY_SKILLS}
      </Button>
      {/* Mounted only while open, so the target reads start with the dialog
          and a closed one leaves no stale Report behind. */}
      {open ? (
        <BulkDeployRun {...props} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

// A repo's value is its absolute path, so it can never collide with this literal.
const GLOBAL_VALUE = "global";

// Plans, executes and reports over the selection, skipping what is already up
// to date on the chosen target.
export function BulkDeployRun({
  stagedNames,
  repos,
  registryReady,
  onClose,
}: BulkDeployProps & { onClose: () => void }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [plan, setPlan] = useState<BulkDeployPlan | null>(null);
  const bulk = useBulkDeploy();
  // Reuses the single-deploy path with the row's own receipt — one behaviour,
  // two entry points (ADR-0006, #66).
  const forceDeploy = useDeploySkill();
  // The skill a refused row asked Update target to add (#955). Set, the Update
  // dialog takes this one's place: the Report described a target it may move.
  const [updateFor, setUpdateFor] = useState<string | null>(null);
  const update = useUpdateTarget();

  const isKnown =
    chosen === GLOBAL_VALUE || repos.some((repo) => repo.path === chosen);
  const selected = isKnown
    ? (chosen as string)
    : (repos[0]?.path ?? GLOBAL_VALUE);
  const isGlobal = selected === GLOBAL_VALUE;
  const target: DeployTarget = isGlobal
    ? { kind: "global" }
    : { kind: "repo", repoPath: selected };
  // Shortened like every other target name in the cockpit (#211).
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

  const chosenTargets = chosenBulkDeployTargets({
    isGlobal,
    targetLabel: chosenLabel,
    target,
    globalTools: globalDeployState.data?.tools,
    repoPrimitives: repoDeployState.data?.primitives,
    repoReleaseHead: repoDeployState.data?.releaseHead,
    drift,
  });

  const onDeploy = () => {
    if (targetLoading) return;
    bulk.reset();
    const next = planBulkDeploy(stagedNames, chosenTargets);
    setPlan(next);
    // A clean-and-latest-only plan is a no-op.
    if (next.toDeploy.length > 0) {
      bulk.mutate({ names: next.toDeploy, target });
    }
  };

  // Empty until bulk.data lands, so the skipped-clean plan still shows. A
  // failed request never falls back to this shape — it takes the error branch.
  const view =
    plan === null || bulk.isPending
      ? null
      : bulkDeployReportView({
          report: bulk.data ?? {
            target,
            deployed: [],
            attention: [],
            failed: [],
          },
          skippedClean: plan.skippedClean,
          targetLabel: chosenLabel,
          requestFailed: bulk.isError,
        });

  if (updateFor !== null) {
    return (
      <UpdateTargetAction
        targetName={isGlobal ? toolNameList(globalTools ?? []) : chosenLabel}
        target={target}
        update={update}
        add={updateFor}
        defaultOpen
        onClose={onClose}
      />
    );
  }

  return (
    <BulkDeployDialog
      count={stagedNames.length}
      targets={[
        {
          value: GLOBAL_VALUE,
          label: globalOptionLabel(globalTools),
          disabled: globalDisabled,
        },
        ...repos.map((repo) => ({
          value: repo.path,
          label: targetLabel(repo.path, repoPaths),
        })),
      ]}
      selected={selected}
      onSelect={(value) => {
        bulk.reset();
        setPlan(null);
        setChosen(value);
      }}
      loadingTargets={!registryReady}
      deployBlocked={targetLoading || (isGlobal && globalDisabled)}
      busy={bulk.isPending}
      failure={
        view?.tone === "error"
          ? {
              level: "error",
              label: bulkDeployDidNotRun(view.targetLabel),
              message: view.message,
            }
          : null
      }
      report={
        view === null || view.tone === "error"
          ? null
          : {
              heading: bulkDeploySummary({
                targetLabel: view.targetLabel,
                counts: view.counts,
              }),
              groups: bulkDeployReportGroups({
                view,
                onForce: (name, confirmedCopyReceipt) =>
                  forceDeploy.mutate({
                    type: "skill",
                    name,
                    target,
                    confirmedCopyReceipt,
                  }),
                onUpdate: setUpdateFor,
              }),
            }
      }
      reportFailure={
        forceDeploy.isError
          ? { ...deployNotice(forceDeploy.error), level: "error" }
          : null
      }
      onDeploy={onDeploy}
      onClose={onClose}
    />
  );
}
