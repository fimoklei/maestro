import type { HarnessStageRow, ReleasePlan, SemverStep } from "@maestro/core";
import type { ComponentProps } from "react";
import { HttpError } from "../api/http";
import { useFolderChooser } from "../ui/use-folder-chooser";
import type { WriteAction } from "../ui/use-write-action";
import { DeletionDialog, type DeletionMode } from "./deletion-dialog";
import { ImportDialog } from "./import-dialog";
import type { ImportCheckLoad } from "./import-view-model";
import {
  deletionCheckNotice,
  importNotice,
  releasePlanNotice,
} from "./notice-copy";
import { ReleaseDialog, type ReleasePlanLoad } from "./release-dialog";
import { RestoreDialog } from "./restore-dialog";
import {
  useDeletionCheck,
  type useImportCheck,
  type useReleasePlan,
} from "./use-harness";
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
  const mode = deletionMode(deletionRow, props.origin);
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
      {deletionRow !== null && mode === "local" ? (
        <LocalDeletionHost
          skill={deletionRow.skill}
          write={props.deleteLocal}
          onClose={props.onDeletionClose}
        />
      ) : null}
      {deletionRow !== null && mode !== null && mode !== "local" ? (
        <DeletionDialog
          skill={deletionRow.skill}
          mode={mode}
          onClose={props.onDeletionClose}
          // The dialog closes on success only: a refusal is stated in it,
          // and the way forward is another confirmation (#580).
          onConfirm={() =>
            props.deletion.run(
              {
                name: deletionRow.skill,
                seenRemoteTree: mode.seenRemoteTree,
              },
              { onSuccess: props.onDeletionClose },
            )
          }
          deleting={props.deletion.phase === "running"}
          deleteError={props.deletion.failure}
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

// Mounted only while the dialog stands, so every opening reads the folder
// afresh, and a stale refusal reads it again before the next confirmation.
function LocalDeletionHost({
  skill,
  write,
  onClose,
}: {
  skill: string;
  write: Presses["deleteLocalWrite"];
  onClose: () => void;
}) {
  const check = useDeletionCheck();
  const context = { skill, screen: "harness" } as const;
  const folder = check.data?.skills[skill];
  const seenWorkingTree = folder?.inClone === true ? folder.workingTree : null;
  const checkFailure = check.isError
    ? deletionCheckNotice("no-answer", context)
    : check.data !== undefined && seenWorkingTree === null
      ? deletionCheckNotice("already-gone", context)
      : null;
  return (
    <DeletionDialog
      skill={skill}
      mode={{
        kind: "local",
        folder: `${SKILLS_DIR}/${skill}`,
        check: check.isFetching
          ? "checking"
          : seenWorkingTree === null
            ? "failed"
            : "ready",
      }}
      onClose={onClose}
      onConfirm={() =>
        seenWorkingTree !== null &&
        write.run(
          { name: skill, seenWorkingTree },
          {
            onSuccess: onClose,
            onError: (error) => {
              if (
                error instanceof HttpError &&
                error.code === "confirmation-stale"
              ) {
                void check.refetch();
              }
            },
          },
        )
      }
      deleting={write.phase === "running"}
      deleteError={write.failure ?? checkFailure}
    />
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
function deletionMode(
  row: HarnessStageRow | null,
  origin: string,
): Extract<DeletionMode, { kind: "propose" }> | "local" | null {
  if (row === null) {
    return null;
  }
  if (row.deletion) {
    return row.remoteTree === null
      ? null
      : { kind: "propose", origin, seenRemoteTree: row.remoteTree };
  }
  return row.localOnly ? "local" : null;
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
