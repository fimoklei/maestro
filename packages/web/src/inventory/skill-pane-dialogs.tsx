import { RemoveSkillFlow } from "../deploy-state/remove-skill-flow";
import { UpdateTargetAction } from "../deploy-state/update-target-action";
import { useUpdateTarget } from "../deploy-state/use-update-target";
import { LocalDeletionDialog } from "../harness/harness-dialogs";
import { localDeletionNotice } from "../harness/local-deletion-copy";
import { useDeleteLocalSkill } from "../harness/use-harness";
import type { RegisteredRepo } from "../registry/use-registry";
import { useScreenReport, useWriteAction } from "../ui/use-write-action";
import { BulkDeployRun } from "./bulk-deploy-action";
import { BulkRemoveRun } from "./bulk-remove-skill-action";
import type { BulkRemoveCandidate } from "./bulk-remove-targets";
import type { SkillDeployment } from "./skill-deployments";

// What the Inventory pane's foot or a target row asked for (#1065). Each
// dialog is mounted only while open, so nothing from one run reaches the next.
export type PaneDialog =
  | { kind: "deploy" }
  | { kind: "remove-all" }
  | { kind: "delete"; localOnly: boolean }
  | { kind: "update"; deployment: SkillDeployment }
  | { kind: "remove"; deployment: SkillDeployment };

export function SkillPaneDialog({
  dialog,
  skillName,
  repos,
  registryReady,
  removable,
  onClose,
  onRemoved,
  onDeleted,
}: {
  dialog: PaneDialog;
  skillName: string;
  repos: RegisteredRepo[];
  registryReady: boolean;
  removable: BulkRemoveCandidate[];
  onClose: () => void;
  /** A proven removal took this target's row away. */
  onRemoved: () => void;
  /** Step 1 removed the folder; the Harness view shows the next step. */
  onDeleted: () => void;
}) {
  switch (dialog.kind) {
    case "delete":
      return (
        <PaneDeletion
          skill={skillName}
          localOnly={dialog.localOnly}
          onClose={onClose}
          onDeleted={onDeleted}
        />
      );
    case "deploy":
      // The selection bar's dialog with this skill alone: a refusal or a
      // partial run reads as its Report (#1065).
      return (
        <BulkDeployRun
          stagedNames={[skillName]}
          repos={repos}
          registryReady={registryReady}
          onClose={onClose}
        />
      );
    case "remove-all":
      return (
        <BulkRemoveRun
          skillName={skillName}
          targets={removable}
          onClose={onClose}
        />
      );
    case "update":
      return (
        <PaneUpdate
          deployment={dialog.deployment}
          skillName={skillName}
          onClose={onClose}
        />
      );
    case "remove":
      return (
        <RemoveSkillFlow
          skillName={skillName}
          version={dialog.deployment.version}
          target={dialog.deployment.removeTarget}
          targetName={dialog.deployment.label}
          onCancel={onClose}
          onRemoved={onRemoved}
        />
      );
  }
}

// It owns the mutation, so the dialog keeps the outcome through the run.
function PaneUpdate({
  deployment,
  skillName,
  onClose,
}: {
  deployment: SkillDeployment;
  skillName: string;
  onClose: () => void;
}) {
  const update = useUpdateTarget();
  return (
    <UpdateTargetAction
      targetName={deployment.updateName}
      target={deployment.target}
      update={update}
      // Priced with this skill, as the Inventory's entrance always was (#955).
      add={skillName}
      defaultOpen
      onClose={onClose}
    />
  );
}

// Its own write, so a refusal names Inventory's controls (#1385).
function PaneDeletion({
  skill,
  localOnly,
  onClose,
  onDeleted,
}: {
  skill: string;
  localOnly: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const write = useWriteAction(useDeleteLocalSkill(), {
    report: useScreenReport(),
    action: "delete",
    show: "row",
    // The Harness view's row states the outcome.
    name: () => null,
    failure: (error) =>
      localDeletionNotice(error, { skill, screen: "inventory" }),
  });
  return (
    <LocalDeletionDialog
      target={{ skill, localOnly }}
      screen="inventory"
      write={write}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
}
