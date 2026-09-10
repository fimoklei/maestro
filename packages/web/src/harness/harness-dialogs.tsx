// The dialogs the Harness view opens, and the two helpers that turn a query's
// three states into the one prop each dialog reads. Every decision above them —
// which is open, what a press does — stays in the view.
import { BrowseDialog } from "../shell/browse-dialog";
import type { useBrowsePicker } from "../shell/use-browse-picker";
import { DeletionDialog, type DeletionMode } from "./deletion-dialog";
import { type ImportCheckLoad, ImportDialog } from "./import-dialog";
import {
  deletionNotice,
  importNotice,
  localDeletionNotice,
  proposalNotice,
  publishReleaseNotice,
  releasePlanNotice,
  restoreNotice,
} from "./notice-copy";
import { ReleaseDialog, type ReleasePlanLoad } from "./release-dialog";
import { RestoreDialog } from "./restore-dialog";
import type {
  HarnessStageRow,
  ReleasePlan,
  SemverStep,
  useDeleteLocalSkill,
  useImportCheck,
  useImportSkill,
  usePromoteDeletion,
  useProposalAction,
  usePublishRelease,
  useReleasePlan,
  useRestoreSkill,
} from "./use-harness";
import { WithdrawDialog } from "./withdraw-dialog";

export type HarnessDialogsProps = {
  origin: string;
  importOpen: boolean;
  source: string | null;
  name: string;
  importCheck: ReturnType<typeof useImportCheck>;
  importSkill: ReturnType<typeof useImportSkill>;
  onPickSource: () => void;
  onNameChange: (name: string) => void;
  onImport: () => void;
  onImported: (name: string) => void;
  onImportClose: () => void;
  picker: ReturnType<typeof useBrowsePicker>;
  deletionRow: HarnessStageRow | null;
  deletion: ReturnType<typeof usePromoteDeletion>;
  deleteLocal: ReturnType<typeof useDeleteLocalSkill>;
  onDeletionClose: () => void;
  // The row a restore was pressed from, and the commit the whole Harness was
  // read at. Null while no confirmation is open, or where HEAD is unreadable.
  restoreRow: HarnessStageRow | null;
  restoreCommit: string | null;
  restore: ReturnType<typeof useRestoreSkill>;
  onRestoreClose: () => void;
  withdrawing: { skill: string; number: number } | null;
  proposalAction: ReturnType<typeof useProposalAction>;
  onWithdrawClose: () => void;
  planOpen: boolean;
  plan: ReturnType<typeof useReleasePlan>;
  publish: ReturnType<typeof usePublishRelease>;
  onPlanClose: () => void;
  onPublish: (step: SemverStep, plan: ReleasePlan) => void;
};

export function HarnessDialogs(props: HarnessDialogsProps) {
  const { deletionRow } = props;
  const mode = deletionMode(deletionRow, props.origin);
  return (
    <>
      {props.importOpen && !props.picker.open ? (
        <ImportDialog
          source={props.source}
          name={props.name}
          load={importLoad(props.source, props.importCheck)}
          onPickSource={props.onPickSource}
          onNameChange={props.onNameChange}
          onClose={props.onImportClose}
          // The dialog stays open on success: it is where the import's
          // outcome is stated, and closing would take that with it.
          onImport={props.onImport}
          onView={props.onImported}
          imported={props.importSkill.data ?? null}
          importing={props.importSkill.isPending}
          importError={importNotice(props.importSkill.error)}
        />
      ) : null}
      {props.picker.open ? (
        <BrowseDialog
          mode="import-source"
          onSelect={props.picker.selectBrowse}
          onClose={props.picker.closeBrowse}
        />
      ) : null}
      {deletionRow !== null && mode !== null ? (
        <DeletionDialog
          skill={deletionRow.skill}
          mode={mode}
          onClose={props.onDeletionClose}
          // The dialog closes on success only: a refusal is stated in it,
          // and the way forward is another confirmation (#580).
          onConfirm={() =>
            mode.kind === "local"
              ? props.deleteLocal.mutate(
                  { name: deletionRow.skill },
                  { onSuccess: props.onDeletionClose },
                )
              : props.deletion.mutate(
                  {
                    name: deletionRow.skill,
                    seenRemoteTree: mode.seenRemoteTree,
                  },
                  { onSuccess: props.onDeletionClose },
                )
          }
          deleting={
            mode.kind === "local"
              ? props.deleteLocal.isPending
              : props.deletion.isPending
          }
          deleteError={
            mode.kind === "local"
              ? localDeletionNotice(props.deleteLocal.error)
              : deletionNotice(props.deletion.error)
          }
        />
      ) : null}
      {props.restoreRow !== null && props.restoreCommit !== null ? (
        <RestoreDialog
          skill={props.restoreRow.skill}
          folder={`${SKILLS_DIR}/${props.restoreRow.skill}`}
          commit={props.restoreCommit}
          hasRequest={props.restoreRow.requests.length > 0}
          onClose={props.onRestoreClose}
          // Closes on success only: a refusal is stated in the dialog, where
          // the confirmation the author gave still stands.
          onConfirm={() =>
            props.restoreRow !== null &&
            props.restoreCommit !== null &&
            props.restore.mutate(
              {
                name: props.restoreRow.skill,
                seenHeadCommit: props.restoreCommit,
                hasRequest: props.restoreRow.requests.length > 0,
              },
              { onSuccess: props.onRestoreClose },
            )
          }
          restoring={props.restore.isPending}
          restoreError={restoreNotice(props.restore.error)}
        />
      ) : null}
      {props.withdrawing !== null ? (
        <WithdrawDialog
          skill={props.withdrawing.skill}
          number={props.withdrawing.number}
          onClose={props.onWithdrawClose}
          // Closes on success only: a refusal is stated in the dialog, and
          // the way forward is another confirmation.
          onConfirm={() =>
            props.withdrawing !== null &&
            props.proposalAction.mutate(
              {
                action: "withdraw",
                name: props.withdrawing.skill,
                number: props.withdrawing.number,
              },
              { onSuccess: props.onWithdrawClose },
            )
          }
          withdrawing={props.proposalAction.isPending}
          withdrawError={proposalNotice(props.proposalAction.error)}
        />
      ) : null}
      {props.planOpen ? (
        <ReleaseDialog
          origin={props.origin}
          load={planLoad(props.plan)}
          onClose={props.onPlanClose}
          onPublish={props.onPublish}
          publishing={props.publish.isPending}
          publishError={publishReleaseNotice(props.publish.error)}
        />
      ) : null}
    </>
  );
}

// The Harness's own skills folder, spelled here rather than imported: `web`
// takes types from `core` and never values (architecture.md).
const SKILLS_DIR = ".apm/skills";

// Which road this row's deletion takes, or null where the row offers neither.
// The two are exclusive: a proposed deletion is tracked somewhere, and a
// local-only skill is tracked nowhere.
function deletionMode(
  row: HarnessStageRow | null,
  origin: string,
): DeletionMode | null {
  if (row === null) {
    return null;
  }
  if (row.deletion) {
    return row.remoteTree === null
      ? null
      : { kind: "propose", origin, seenRemoteTree: row.remoteTree };
  }
  return row.localOnly
    ? { kind: "local", folder: `${SKILLS_DIR}/${row.skill}` }
    : null;
}

// Idle until a folder is picked: with nothing to judge there is no refusal to
// state, and "loading" would claim a request that was never made.
function importLoad(
  source: string | null,
  check: ReturnType<typeof useImportCheck>,
): ImportCheckLoad {
  if (source === null) {
    return { kind: "idle" };
  }
  if (check.data !== undefined) {
    return { kind: "ready", check: check.data };
  }
  const failed = importNotice(check.error);
  if (failed !== null) {
    return { kind: "error", notice: failed };
  }
  return { kind: "loading" };
}

// The dialog stays mounted through loading, error, and the ready plan, so the
// query's three states become its one prop.
function planLoad(plan: ReturnType<typeof useReleasePlan>): ReleasePlanLoad {
  if (plan.data !== undefined) {
    return { kind: "ready", plan: plan.data };
  }
  const failed = releasePlanNotice(plan.error);
  if (failed !== null) {
    return { kind: "error", notice: failed };
  }
  return { kind: "loading" };
}
