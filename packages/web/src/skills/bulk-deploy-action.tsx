import type { BulkDeployReport } from "@maestro/core";
import { useState } from "react";
import { NO_TOOL_DETECTED } from "../deploy-state/deploy-state-copy";
import type { DeployStateRead } from "../deploy-state/deployed-view";
import { deployNotice, deployNoticeFor } from "../deploy-state/notice-copy";
import { toolNameList } from "../deploy-state/tool-presentation";
import { UpdateTargetAction } from "../deploy-state/update-target-action";
import { useDeployState } from "../deploy-state/use-deploy-state";
import {
  type GlobalDeployStateView,
  useGlobalDeployState,
} from "../deploy-state/use-global-deploy-state";
import { useUpdateTarget } from "../deploy-state/use-update-target";
import { type DriftViewModel, driftViewModel } from "../drift/drift-view-model";
import { useDrift, useGlobalDrift } from "../drift/use-drift";
import type { DeploymentTarget } from "../inventory/deployed-rollup";
import {
  type DeployTarget,
  useDeploySkill,
} from "../inventory/use-deploy-skill";
import type { RegisteredRepo } from "../registry/use-registry";
import { repoTargetName } from "../shell/target-name";
import { ACTIONS } from "../ui/busy-copy";
import { Button } from "../ui/button";
import { UPDATE_TARGET } from "../ui/control-labels";
import type { ReportGroup, ReportRowAction } from "../ui/report";
import { useScreenWrites, useWriteAction } from "../ui/use-write-action";
import { BulkDeployDialog } from "./bulk-deploy-dialog";
import { bulkDeploySkillGroups } from "./bulk-deploy-skill-groups";
import { globalToolTargets, repoTarget } from "./deployment-target-rows";
import { type BulkDeployPlan, planBulkDeploy } from "./plan-bulk-deploy";
import {
  bulkDeployDidNotRun,
  DEPLOY_SKILLS,
  globalOptionLabel,
  NO_TARGET_CHOSEN,
  TARGETS_LOADING,
} from "./skills-copy";
import { useBulkDeploy } from "./use-bulk-deploy";

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
  // The Attention rows Deploy again has since deployed: they read as Deployed.
  const [redeployed, setRedeployed] = useState<SkillRelease[]>([]);
  const update = useUpdateTarget();
  const screen = useScreenWrites();
  // The Report states the run, its request failure included.
  const bulkWrite = useWriteAction(bulk, {
    screen,
    action: "deploy",
    subject: () => null,
    failure: () => null,
  });
  // The Report states the reinstall: its row moves to Deployed.
  const forceWrite = useWriteAction(forceDeploy, {
    screen,
    action: "deploy",
    subject: () => null,
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
            label: repoTargetName(selected, repoPaths),
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
    setRedeployed([]);
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
          redeployed,
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
          label: repoTargetName(repo.path, repoPaths),
        })),
      ]}
      selected={selected}
      skills={bulkDeploySkillGroups(stagedNames, preview)}
      onSelect={(value) => {
        bulk.reset();
        setRedeployed([]);
        setPlan(null);
        setChosen(value);
      }}
      unavailable={
        !registryReady || targetLoading
          ? TARGETS_LOADING
          : selected === null
            ? NO_TARGET_CHOSEN
            : isGlobal && globalDisabled
              ? NO_TOOL_DETECTED
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
                    forceWrite.run(
                      {
                        type: "skill",
                        name,
                        target: chosenRun.target,
                        confirmedCopyReceipt,
                      },
                      {
                        onSuccess: ({ deployed }) =>
                          setRedeployed((rows) => [
                            ...rows,
                            { name: deployed.name, version: deployed.version },
                          ]),
                      },
                    ),
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

/** A skill at the release a run deployed. */
type SkillRelease = { name: string; version: string };

type BulkReportCounts = {
  deployed: number;
  skipped: number;
  attention: number;
  failed: number;
};

// "error" is the bulk request itself failing: zeroed counts never read as clean.
type BulkDeployReportView =
  | {
      tone: "ran";
      targetLabel: string;
      // Every success, at the release the target already follows (#956).
      deployed: SkillRelease[];
      skipped: string[];
      attention: BulkDeployReport["attention"];
      failed: BulkDeployReport["failed"];
      counts: BulkReportCounts;
    }
  | {
      tone: "error";
      targetLabel: string;
      message: string;
    };

// One idea: how many reached the target, a skill already up to date
// included. The groups carry the other counts.
function bulkDeploySummary(input: {
  targetLabel: string;
  counts: BulkReportCounts;
}): string {
  const { deployed, skipped, attention, failed } = input.counts;
  const total = deployed + skipped + attention + failed;
  return `Deployed ${deployed + skipped} of ${total} ${total === 1 ? "skill" : "skills"} to ${input.targetLabel}`;
}

function bulkDeployReportView(input: {
  report: BulkDeployReport;
  skippedClean: string[];
  // Attention rows a later Deploy again succeeded on.
  redeployed: SkillRelease[];
  targetLabel: string;
  // `report` carries no real data when true — must never be read.
  requestFailed?: boolean;
}): BulkDeployReportView {
  const { report, skippedClean, redeployed, targetLabel } = input;

  if (input.requestFailed) {
    // Never the error's own text: the bulk route answers 200 with a report, so a
    // thrown error is a dropped connection or a malformed request.
    return {
      tone: "error",
      targetLabel,
      message:
        "The Maestro server did not answer. Deploy to this target again.",
    };
  }

  // A merged failure line carries every affected skill — sum names, not lines.
  const failedCount = report.failed.reduce(
    (total, line) => total + line.names.length,
    0,
  );

  const attention = report.attention.filter(
    (row) => !redeployed.some((done) => done.name === row.name),
  );
  const deployed = [...report.deployed, ...redeployed];

  return {
    tone: "ran",
    targetLabel,
    deployed,
    skipped: skippedClean,
    attention,
    failed: report.failed,
    counts: {
      deployed: deployed.length,
      skipped: skippedClean.length,
      attention: attention.length,
      failed: failedCount,
    },
  };
}

type Force = {
  /** The row's own consent, so an inline deploy grants only what it read. */
  run: (name: string, confirmedCopyReceipt?: string) => void;
  /** The skill whose Deploy again is in flight: a second press would send a second deploy (#757). */
  running: string | null;
};

function deployAgain(
  name: string,
  copyReceipt: string | undefined,
  force: Force,
): ReportRowAction {
  const onClick = () => force.run(name, copyReceipt);
  if (force.running === null) return { label: `Deploy ${name} again`, onClick };
  return force.running === name
    ? {
        label: ACTIONS.deploy.busy,
        onClick,
        status: "busy",
      }
    : { label: `Deploy ${name} again`, onClick, status: "locked" };
}

/** The run folded into the Report's groups. Empty groups are not drawn. */
function bulkDeployReportGroups(input: {
  view: Extract<BulkDeployReportView, { tone: "ran" }>;
  force: Force;
  /** Update target priced with this skill: the release move the deploy lacked (#955). */
  onUpdate?: (name: string) => void;
}): ReportGroup[] {
  const { view, force, onUpdate } = input;
  return [
    {
      tone: "failed",
      label: "Failed",
      rows: view.failed.map((line) => ({
        name: line.names.join(", "),
        count: line.names.length,
        notice: deployNoticeFor(line.error, line.linkedPath),
      })),
    },
    {
      tone: "attention",
      label: "Attention",
      rows: view.attention.map((row) => ({
        name: row.name,
        notice: deployNoticeFor(row.error, undefined),
        action: row.forceable
          ? deployAgain(row.name, row.copyReceipt, force)
          : onUpdate && row.error === "not-at-target-release"
            ? { label: UPDATE_TARGET, onClick: () => onUpdate(row.name) }
            : undefined,
      })),
    },
    {
      tone: "neutral",
      label: "Already up to date",
      rows: view.skipped.map((name) => ({ name })),
    },
    {
      tone: "good",
      label: "Deployed",
      rows: view.deployed.map((row) => ({
        name: row.name,
        detail: row.version,
      })),
    },
  ];
}

// Global is one target per detected tool — apm tracks each tool's install
// separately, so present-on-Claude-missing-on-Codex must not read as clean
// (#292). Still-loading stays "pending", so a skill is attempted, not assumed clean.
function chosenBulkDeployTargets(params: {
  isGlobal: boolean;
  targetLabel: string;
  // What a write would name. Every row here belongs to the one chosen target.
  target: DeployTarget;
  globalState: Pick<GlobalDeployStateView, "tools" | "skipped"> | undefined;
  // Ignored when isGlobal is true.
  repoRead: DeployStateRead;
  drift: DriftViewModel;
}): DeploymentTarget[] {
  const { isGlobal, targetLabel, target, globalState, repoRead, drift } =
    params;

  if (isGlobal) {
    if (globalState === undefined) {
      return [
        {
          pending: undefined,
          label: targetLabel,
          target,
          deployed: { status: "pending" },
          primitives: [],
          drift,
        },
      ];
    }
    return globalToolTargets(globalState, drift);
  }

  return [repoTarget({ label: targetLabel, target, read: repoRead, drift })];
}
