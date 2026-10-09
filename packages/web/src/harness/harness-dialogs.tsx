import type { HarnessStageRow, ReleasePlan, SemverStep } from "@maestro/core";
import type { ComponentProps } from "react";
import { HttpError } from "../api/http";
import { useFolderChooser } from "../ui/use-folder-chooser";
import type { WriteAction } from "../ui/use-write-action";
import { DeletionDialog, type DeletionMode } from "./deletion-dialog";
import { DiscardDialog } from "./discard-dialog";
import { ImportDialog } from "./import-dialog";
import type { ImportCheckLoad } from "./import-view-model";
import {
  deletionCheckNotice,
  type LocalDeletionContext,
} from "./local-deletion-copy";
import { importNotice, releasePlanNotice } from "./notice-copy";
import { ReleaseDialog, type ReleasePlanLoad } from "./release-dialog";
import { RestoreDialog } from "./restore-dialog";
import {
  folderInClone,
  useDeletionCheck,
  useHarness,
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

// The request itself, frozen at the press.
export type DiscardTarget = { name: string; seenRemoteTree: string };

// `localOnly` picks the dialog's copy: a skill in no ref, or step 1 of a
// deletion the default branch still holds (#1370).
export type LocalDeletionTarget = { skill: string; localOnly: boolean };

type Presses = ReturnType<typeof useHarnessPresses>;

export type HarnessDialogsProps = {
  origin: string;
  importFlow: ReturnType<typeof useImportFlow>;
  deletionRow: HarnessStageRow | null;
  deletion: Presses["deletionWrite"];
  onDeletionClose: () => void;
  localDeletion: LocalDeletionTarget | null;
  deleteLocal: Presses["deleteLocalWrite"];
  onLocalDeletionClose: () => void;
  restoring: RestoreTarget | null;
  restore: Presses["restoreWrite"];
  onRestoreClose: () => void;
  discarding: DiscardTarget | null;
  discard: Presses["discardWrite"];
  onDiscardClose: () => void;
  defaultBranch: string | null;
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
          sourceError={props.importFlow.sourceError}
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
      {props.localDeletion !== null ? (
        <LocalDeletionDialog
          target={props.localDeletion}
          screen="harness"
          write={props.deleteLocal}
          onClose={props.onLocalDeletionClose}
          // The row changes in place; nothing more to show.
          onDeleted={props.onLocalDeletionClose}
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
      {props.discarding !== null ? (
        <DiscardDialog
          skill={props.discarding.name}
          folder={`${SKILLS_DIR}/${props.discarding.name}`}
          defaultBranch={props.defaultBranch}
          onClose={props.onDiscardClose}
          // Closes on success only: a refusal is stated in the dialog.
          onConfirm={() =>
            props.discarding !== null &&
            props.discard.run(props.discarding, {
              onSuccess: props.onDiscardClose,
            })
          }
          discarding={props.discard.phase === "running"}
          discardError={props.discard.failure}
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
// Inventory opens it too (#1385); `screen` picks the control its notices name.
export function LocalDeletionDialog({
  target: { skill, localOnly },
  screen,
  write,
  onClose,
  onDeleted,
}: {
  target: LocalDeletionTarget;
  screen: LocalDeletionContext["screen"];
  write: Presses["deleteLocalWrite"];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const check = useDeletionCheck();
  const harness = useHarness();
  const context = { skill, screen };
  const folder = folderInClone(check.data?.skills[skill]);
  const seenWorkingTree = folder?.workingTree ?? null;
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
        // Both screens read the Harness already; the plain word stands in
        // until that read lands. The host is dropped: owner/repo names it.
        origin: harness.data?.origin.replace(/^[^/]+\//, "") ?? "the Harness",
        screen,
        folder: `${SKILLS_DIR}/${skill}`,
        check: check.isFetching
          ? "checking"
          : seenWorkingTree === null
            ? "failed"
            : "ready",
        localOnly,
        uncommitted: folder?.uncommitted === true,
      }}
      onClose={onClose}
      onConfirm={() =>
        seenWorkingTree !== null &&
        write.run(
          { name: skill, seenWorkingTree },
          {
            onSuccess: onDeleted,
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

// The proposed deletion this row confirms, or null where it offers none.
function deletionMode(
  row: HarnessStageRow | null,
  origin: string,
): Extract<DeletionMode, { kind: "propose" }> | null {
  if (row === null || row.change !== "deletion" || row.remoteTree === null) {
    return null;
  }
  // A proposal row links only a sole open request, and any open request on a
  // Pending proposal Deletion row proposes changes.
  const open = row.requests[0];
  return {
    kind: "propose",
    origin,
    seenRemoteTree: row.remoteTree,
    openRequest:
      open === undefined ? null : { number: open.number, author: open.author },
  };
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
