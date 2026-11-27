import type { HarnessStageRow, PrimitiveRef } from "@maestro/core";
import type { ReactNode } from "react";
import { DeletionDialog, type DeletionMode } from "./deletion-dialog";
import { DiscardDialog } from "./discard-dialog";
import type { HarnessDialogPayloads } from "./harness-dialogs";
import { LocalDeletionDialog } from "./local-deletion-dialog";
import { ReleaseWithdrawalDialogHost } from "./release-withdrawal-dialog-host";
import { RestoreDialog } from "./restore-dialog";
import type { useHarnessPresses } from "./use-harness-presses";
import { WithdrawDialogHost } from "./withdraw-dialog-host";

type Presses = ReturnType<typeof useHarnessPresses>;

type RowConfirmation = Exclude<
  keyof HarnessDialogPayloads,
  "release" | "import-skills" | "import-prompts" | "edit-prompt"
>;

export function rowConfirmations(
  presses: Presses,
  origin: string,
): {
  [Name in RowConfirmation]: (
    payload: HarnessDialogPayloads[Name],
  ) => ReactNode;
} {
  return {
    "local-deletion": (target) => (
      <LocalDeletionDialog
        target={target}
        screen="harness"
        write={presses.deleteLocalWrite}
        onClose={presses.closeLocalDeletion}
      />
    ),
    deletion: (row) => {
      const mode = deletionMode(row, origin);
      return mode === null ? null : (
        <DeletionDialog
          type={row.type}
          name={row.name}
          mode={mode}
          onClose={presses.closeConfirmation}
          onConfirm={() =>
            presses.deletionWrite.run(
              {
                type: row.type,
                name: row.name,
                seenRemoteTree: mode.seenRemoteTree,
              },
              { onSuccess: presses.closeConfirmation },
            )
          }
          deleting={presses.deletionWrite.phase === "running"}
          deleteError={presses.deletionWrite.failure}
        />
      );
    },
    restore: (target) => (
      <RestoreDialog
        type={target.type}
        name={target.name}
        path={target.path}
        commit={target.commit}
        hasRequest={target.hasRequest}
        onClose={presses.closeRestore}
        onConfirm={() =>
          presses.restoreWrite.run(
            {
              type: target.type,
              name: target.name,
              seenHeadCommit: target.commit,
              hasRequest: target.hasRequest,
            },
            { onSuccess: presses.closeRestore },
          )
        }
        restoring={presses.restoreWrite.phase === "running"}
        restoreError={presses.restoreWrite.failure}
      />
    ),
    discard: (target) => (
      <DiscardDialog
        type={target.type}
        name={target.name}
        path={target.path}
        onClose={presses.closeDiscard}
        onConfirm={() =>
          presses.discardWrite.run(
            {
              type: target.type,
              name: target.name,
              seenRemoteTree: target.seenRemoteTree,
            },
            { onSuccess: presses.closeDiscard },
          )
        }
        discarding={presses.discardWrite.phase === "running"}
        discardError={presses.discardWrite.failure}
      />
    ),
    withdraw: (target) => (
      <WithdrawDialogHost
        target={target}
        write={presses.proposalWrite}
        onClose={presses.closeWithdrawal}
      />
    ),
    "release-withdrawal": () =>
      presses.releaseWithdrawing === null ? null : (
        <ReleaseWithdrawalDialogHost
          target={presses.releaseWithdrawing}
          write={presses.releaseWithdrawalWrite}
          onClose={presses.closeReleaseWithdrawal}
        />
      ),
  };
}

function deletionMode(
  row: HarnessStageRow & PrimitiveRef,
  origin: string,
): Extract<DeletionMode, { kind: "propose" }> | null {
  if (row.change !== "deletion" || row.remoteTree === null) {
    return null;
  }
  const open = row.requests[0];
  return {
    kind: "propose",
    origin,
    branch: row.branch,
    seenRemoteTree: row.remoteTree,
    openRequest:
      open === undefined ? null : { number: open.number, author: open.author },
  };
}
