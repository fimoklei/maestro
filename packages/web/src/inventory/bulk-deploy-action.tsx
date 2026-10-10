import { useState } from "react";
import { deployNotice } from "../deploy-state/notice-copy";
import { toolNameList } from "../deploy-state/tool-presentation";
import { UpdateTargetAction } from "../deploy-state/update-target-action";
import { useDeployState } from "../deploy-state/use-deploy-state";
import { useGlobalDeployState } from "../deploy-state/use-global-deploy-state";
import { useUpdateTarget } from "../deploy-state/use-update-target";
import { driftViewModel } from "../drift/drift-view-model";
import { useDrift, useGlobalDrift } from "../drift/use-drift";
import type { RegisteredRepo } from "../registry/use-registry";
import { targetLabel } from "../shell/target-label";
import { Button } from "../ui/button";
import { UPDATE_TARGET } from "../ui/control-labels";
import { useScreenReport, useWriteAction } from "../ui/use-write-action";
import { BulkDeployDialog } from "./bulk-deploy-dialog";
import {
  bulkDeployReportGroups,
  bulkDeployReportView,
  bulkDeploySummary,
} from "./bulk-deploy-report-view";
import { bulkDeploySkillGroups } from "./bulk-deploy-skill-groups";
import { chosenBulkDeployTargets } from "./bulk-deploy-targets";
import {
  bulkDeployDidNotRun,
  DEPLOY_SKILLS,
  globalOptionLabel,
  NO_TARGET_CHOSEN,
  NO_TOOL_DETECTED_CAUSE,
  TARGETS_LOADING,
} from "./inventory-copy";
import { type BulkDeployPlan, planBulkDeploy } from "./plan-bulk-deploy";
import { useBulkDeploy } from "./use-bulk-deploy";
import { type DeployTarget, useDeploySkill } from "./use-deploy-skill";

type BulkDeployProps = {
  stagedNames: string[];
  repos: RegisteredRepo[];
  registryReady: boolean;
};

// The selection bar's **Deploy skills** and the dialog it opens (#291, #292).
export function BulkDeployAction({
  onSelectionSpent,
  ...props
}: BulkDeployProps & { onSelectionSpent: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        {DEPLOY_SKILLS}
      </Button>
      {/* Mounted only while open, so the target reads start with the dialog
          and a closed one leaves no stale Report behind. */}
      {open ? (
        <BulkDeployRun
          {...props}
          onClose={(reported) => {
            setOpen(false);
            if (reported) onSelectionSpent();
          }}
        />
      ) : null}
    </>
  );
}

// A repo's value is its absolute path, so it can never collide with this literal.
const GLOBAL_VALUE = "global";

// Skips what is already up to date on the chosen target.
export function BulkDeployRun({
  stagedNames,
  repos,
  registryReady,
  onClose,
}: BulkDeployProps & { onClose: (reported: boolean) => void }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [plan, setPlan] = useState<BulkDeployPlan | null>(null);
  const bulk = useBulkDeploy();
  // Reuses the single-deploy path with the row's own receipt (#66).
  const forceDeploy = useDeploySkill();
  // The skill a refused row asked Update target to add (#955). Set, the Update
  // dialog takes this one's place: the Report described a target it may move.
  const [updateFor, setUpdateFor] = useState<string | null>(null);
  const update = useUpdateTarget();
  const report = useScreenReport();
  // The Report states the run, its request failure included.
  const bulkWrite = useWriteAction(bulk, {
    report,
    action: "deploy",
    show: "row",
    name: () => null,
    failure: () => null,
  });
  const forceWrite = useWriteAction(forceDeploy, {
    report,
    action: "deploy",
    show: "row",
    name: (_data, { name }) => name,
    failure: (error) => ({ ...deployNotice(error), level: "error" as const }),
  });

  const isKnown =
    chosen === GLOBAL_VALUE || repos.some((repo) => repo.path === chosen);
  const selected = isKnown ? chosen : null;
  const isGlobal = selected === GLOBAL_VALUE;
  // Shortened like every other target name in the cockpit (#211).
  const repoPaths = repos.map((repo) => repo.path);
  const repoSelected = selected !== null && !isGlobal;
  const chosenRun: { target: DeployTarget; label: string } | null =
    selected === null
      ? null
      : isGlobal
        ? { target: { kind: "global" }, label: "Global" }
        : {
            target: { kind: "repo", repoPath: selected },
            label: targetLabel(selected, repoPaths),
          };

  const repoDeployState = useDeployState(
    repoSelected ? selected : "",
    registryReady && repoSelected,
  );
  const globalDeployState = useGlobalDeployState(registryReady);
  const repoDrift = useDrift(
    repoSelected ? selected : "",
    registryReady && repoSelected,
  );
  const globalDrift = useGlobalDrift(registryReady && isGlobal);
  const deployState = isGlobal ? globalDeployState : repoDeployState;
  const rawDrift = isGlobal ? globalDrift : repoDrift;
  const drift = driftViewModel(rawDrift);
  // The plan waits rather than guessing, or every skill reads "not deployed" and
  // gets a pointless reinstall.
  const targetLoading =
    chosenRun !== null &&
    registryReady &&
    (deployState.data === undefined || rawDrift.data === undefined);

  const globalTools = globalDeployState.data?.detectedTools;
  const globalDisabled = globalTools !== undefined && globalTools.length === 0;

  // The one plan the dialog shows and the run follows, so they cannot disagree.
  const preview =
    chosenRun === null || targetLoading
      ? null
      : planBulkDeploy(
          stagedNames,
          chosenBulkDeployTargets({
            isGlobal,
            targetLabel: chosenRun.label,
            target: chosenRun.target,
            globalState: globalDeployState.data,
            repoRead: repoDeployState,
            drift,
          }),
        );

  const onDeploy = () => {
    if (chosenRun === null || preview === null) return;
    bulk.reset();
    setPlan(preview);
    if (preview.toDeploy.length > 0) {
      bulkWrite.run({ names: preview.toDeploy, target: chosenRun.target });
    }
  };

  // Empty until bulk.data lands, so the skipped-clean plan still shows. A
  // failed request never falls back to this shape — it takes the error branch.
  const view =
    plan === null || chosenRun === null || bulk.isPending
      ? null
      : bulkDeployReportView({
          report: bulk.data ?? {
            target: chosenRun.target,
            deployed: [],
            attention: [],
            failed: [],
          },
          skippedClean: plan.skippedClean,
          targetLabel: chosenRun.label,
          requestFailed: bulk.isError,
        });

  const close = () => onClose(plan !== null && !bulk.isError);

  if (updateFor !== null && chosenRun !== null) {
    return (
      <UpdateTargetAction
        targetName={
          isGlobal ? toolNameList(globalTools ?? []) : chosenRun.label
        }
        updateLabel={UPDATE_TARGET}
        target={chosenRun.target}
        update={update}
        add={updateFor}
        defaultOpen
        onClose={close}
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
      skills={bulkDeploySkillGroups(stagedNames, preview)}
      onSelect={(value) => {
        bulk.reset();
        setPlan(null);
        setChosen(value);
      }}
      unavailable={
        !registryReady || targetLoading
          ? TARGETS_LOADING
          : selected === null
            ? NO_TARGET_CHOSEN
            : isGlobal && globalDisabled
              ? NO_TOOL_DETECTED_CAUSE
              : null
      }
      fieldsChanged={chosen !== null}
      busy={bulkWrite.phase === "running" || forceWrite.phase === "running"}
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
        view === null || chosenRun === null || view.tone === "error"
          ? null
          : {
              heading: bulkDeploySummary({
                targetLabel: view.targetLabel,
                counts: view.counts,
              }),
              groups: bulkDeployReportGroups({
                view,
                force: {
                  run: (name, confirmedCopyReceipt) =>
                    forceWrite.run({
                      type: "skill",
                      name,
                      target: chosenRun.target,
                      confirmedCopyReceipt,
                    }),
                  running: forceDeploy.isPending
                    ? forceDeploy.variables.name
                    : null,
                },
                onUpdate: setUpdateFor,
              }),
            }
      }
      reportFailure={forceWrite.failure}
      onDeploy={onDeploy}
      onClose={close}
    />
  );
}
