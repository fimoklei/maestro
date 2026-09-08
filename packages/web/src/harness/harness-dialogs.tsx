// The dialogs the Harness view opens, and the two helpers that turn a query's
// three states into the one prop each dialog reads. Every decision above them —
// which is open, what a press does — stays in the view.
import { BrowseDialog } from "../shell/browse-dialog";
import type { useBrowsePicker } from "../shell/use-browse-picker";
import { DeletionDialog } from "./deletion-dialog";
import { type ImportCheckLoad, ImportDialog } from "./import-dialog";
import {
  deletionNotice,
  importNotice,
  proposalNotice,
  publishReleaseNotice,
  releasePlanNotice,
} from "./notice-copy";
import { ReleaseDialog, type ReleasePlanLoad } from "./release-dialog";
import type {
  HarnessStageRow,
  ReleasePlan,
  SemverStep,
  useImportCheck,
  useImportSkill,
  usePromoteDeletion,
  useProposalAction,
  usePublishRelease,
  useReleasePlan,
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
  onDeletionClose: () => void;
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
      {deletionRow !== null && deletionRow.remoteTree !== null ? (
        <DeletionDialog
          skill={deletionRow.skill}
          origin={props.origin}
          seenRemoteTree={deletionRow.remoteTree}
          onClose={props.onDeletionClose}
          // The dialog closes on success only: a refusal is stated in it,
          // and the way forward is another confirmation (#580).
          onConfirm={() =>
            props.deletion.mutate(
              {
                name: deletionRow.skill,
                seenRemoteTree: deletionRow.remoteTree as string,
              },
              { onSuccess: props.onDeletionClose },
            )
          }
          deleting={props.deletion.isPending}
          deleteError={deletionNotice(props.deletion.error)}
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
