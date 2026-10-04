import type { HarnessStageRow, ReleasePlan, SemverStep } from "@maestro/core";
import type { ComponentProps } from "react";
import { useFolderChooser } from "../ui/use-folder-chooser";
import type { WriteAction } from "../ui/use-write-action";
import { DeletionDialog, type DeletionMode } from "./deletion-dialog";
import { ImportDialog } from "./import-dialog";
import type { ImportCheckLoad } from "./import-view-model";
import { importNotice, releasePlanNotice } from "./notice-copy";
import { ReleaseDialog, type ReleasePlanLoad } from "./release-dialog";
import { RestoreDialog } from "./restore-dialog";
import type { useImportCheck, useReleasePlan } from "./use-harness";
import type { useHarnessPresses } from "./use-harness-presses";
import type { useImportFlow } from "./use-import-flow";
import { WithdrawDialog } from "./withdraw-dialog";

// Frozen when the press was made: a later read moves the rows underneath, it
// never moves this (#915).
export type RestoreTarget = {
  skill: string;
  commit: string;
  hasRequest: boolean;
};

type Presses = ReturnType<typeof useHarnessPresses>;

export type HarnessDialogsProps = {
  origin: string;
  importFlow: ReturnType<typeof useImportFlow>;
  deletionRow: HarnessStageRow | null;
  deletion: Presses["deletionWrite"];
  deleteLocal: Presses["deleteLocalWrite"];
  onDeletionClose: () => void;
  restoring: RestoreTarget | null;
  restore: Presses["restoreWrite"];
  onRestoreClose: () => void;
  withdrawing: { skill: string; number: number } | null;
  proposalAction: Presses["proposalWrite"];
  onWithdrawClose: () => void;
  planOpen: boolean;
  plan: ReturnType<typeof useReleasePlan>;
  publish: Pick<WriteAction<unknown, unknown>, "phase" | "failure">;
  onPlanClose: () => void;
  onPublish: (step: SemverStep, plan: ReleasePlan) => void;
};

export function HarnessDialogs(props: HarnessDialogsProps) {
  const { deletionRow } = props;
  const mode = deletionMode(deletionRow);
  return (
    <>
      {props.importFlow.open ? (
        <ImportDialogHost
          source={props.importFlow.source}
          sourceText={props.importFlow.sourceText}
          onSourceChange={props.importFlow.setSourceText}
          onSourceCommit={props.importFlow.commitSource}
          name={props.importFlow.name}
          load={importLoad(props.importFlow.source, props.importFlow.check)}
          onNameChange={props.importFlow.setEditedName}
          onClose={props.importFlow.close}
          onImport={props.importFlow.submit}
          importing={props.importFlow.importWrite.phase === "running"}
          importError={props.importFlow.importWrite.failure}
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
              ? props.deleteLocal.run(
                  { name: deletionRow.skill },
                  { onSuccess: props.onDeletionClose },
                )
              : props.deletion.run(
                  {
                    name: deletionRow.skill,
                    seenRemoteTree: mode.seenRemoteTree,
                  },
                  { onSuccess: props.onDeletionClose },
                )
          }
          deleting={
            (mode.kind === "local" ? props.deleteLocal : props.deletion)
              .phase === "running"
          }
          deleteError={
            (mode.kind === "local" ? props.deleteLocal : props.deletion).failure
          }
        />
      ) : null}
      {props.restoring !== null ? (
        <RestoreDialog
          skill={props.restoring.skill}
          folder={`${SKILLS_DIR}/${props.restoring.skill}`}
          commit={props.restoring.commit}
          hasRequest={props.restoring.hasRequest}
          onClose={props.onRestoreClose}
          // Closes on success only: a refusal is stated in the dialog, where
          // the confirmation the author gave still stands.
          onConfirm={() =>
            props.restoring !== null &&
            props.restore.run(
              {
                name: props.restoring.skill,
                seenHeadCommit: props.restoring.commit,
                hasRequest: props.restoring.hasRequest,
              },
              { onSuccess: props.onRestoreClose },
            )
          }
          restoring={props.restore.phase === "running"}
          restoreError={props.restore.failure}
        />
      ) : null}
      {props.withdrawing !== null ? (
        <WithdrawDialog
          skill={props.withdrawing.skill}
          number={props.withdrawing.number}
          onClose={props.onWithdrawClose}
          onConfirm={() =>
            props.withdrawing !== null &&
            props.proposalAction.run(
              {
                action: "withdraw",
                name: props.withdrawing.skill,
                number: props.withdrawing.number,
              },
              { onSuccess: props.onWithdrawClose },
            )
          }
          withdrawing={props.proposalAction.phase === "running"}
          withdrawError={props.proposalAction.failure}
        />
      ) : null}
      {props.planOpen ? (
        <ReleaseDialog
          origin={props.origin}
          load={planLoad(props.plan)}
          onClose={props.onPlanClose}
          onPublish={props.onPublish}
          publishing={props.publish.phase === "running"}
          publishError={props.publish.failure}
        />
      ) : null}
    </>
  );
}

function ImportDialogHost(
  props: Omit<ComponentProps<typeof ImportDialog>, "chooser">,
) {
  return <ImportDialog {...props} chooser={useFolderChooser()} />;
}

// Spelled here rather than imported: `web` takes only types from `core`.
const SKILLS_DIR = ".apm/skills";

// Which road this row's deletion takes, or null where the row offers neither.
// The two are exclusive: a proposed deletion is tracked somewhere, and a
// local-only skill is tracked nowhere.
function deletionMode(row: HarnessStageRow | null): DeletionMode | null {
  if (row === null) {
    return null;
  }
  if (row.deletion) {
    // A proposal row links only a sole open request, and any open request
    // on a Deleted locally row proposes changes.
    const open = row.requests[0];
    return row.remoteTree === null
      ? null
      : {
          kind: "propose",
          seenRemoteTree: row.remoteTree,
          openRequest:
            open === undefined
              ? null
              : { number: open.number, author: open.author },
        };
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
