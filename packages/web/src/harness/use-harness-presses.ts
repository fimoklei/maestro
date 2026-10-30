import type {
  HarnessStage,
  HarnessStageRow,
  HarnessState,
  PrimitiveRef,
} from "@maestro/core";
import { useState } from "react";
import type { NoticeContent } from "../ui/notice";
import { named, phrase } from "../ui/phrase";
import {
  type ScreenWrites,
  type Subject,
  useWriteAction,
} from "../ui/use-write-action";
import { rowId } from "./harness-columns";
import type {
  DiscardTarget,
  LocalDeletionTarget,
  ReleaseWithdrawalItem,
  ReleaseWithdrawalTarget,
  RestoreTarget,
  WithdrawTarget,
} from "./harness-dialogs";
import { localDeletionNotice } from "./local-deletion-copy";
import {
  deletionNotice,
  discardNotice,
  promoteNotice,
  proposalNotice,
  restoreNotice,
} from "./notice-copy";
import { releaseWithdrawalNotice } from "./release-withdrawal-notice-copy";
import {
  offersDiscard,
  type RowActionHandlers,
  type RunningPress,
} from "./row-actions";
import {
  useDeleteLocalPrimitive,
  useDiscardChange,
  usePromoteDeletion,
  usePromotePrimitive,
  useProposalAction,
  useRestorePrimitive,
  useWithdrawFromRelease,
} from "./use-harness";
import { withdrawNotice } from "./withdraw-notice-copy";

// The row a press lands on, named by the request it sent.
const pressedRow = (stage: HarnessStage, { type, name }: PrimitiveRef) =>
  rowId({ stage, type, name });

// A press names its primitive, and the row in the stage it lands in.
const landsIn =
  (stage: HarnessStage) =>
  (_data: unknown, pressed: PrimitiveRef): Subject => ({
    name: pressed.name,
    row: pressedRow(stage, pressed),
  });

export function useHarnessPresses(
  state: HarnessState | undefined,
  screen: ScreenWrites,
) {
  const promote = usePromotePrimitive();
  const promoteWrite = useWriteAction(promote, {
    screen,
    action: "propose",
    subject: landsIn("pending-review"),
    // A failure follows a press, so the variables are set.
    failure: (error) =>
      promoteNotice(error, promote.variables?.type ?? "skill"),
  });
  const promotedSkill = promote.variables ?? null;
  const promoteFailure = promoteWrite.failure;
  // The stage the press was made in. Propose change sits in two of them, and a
  // refusal belongs to the row it was pressed from, not to the skill (#865).
  const [promotedFrom, setPromotedFrom] = useState<HarnessStage | null>(null);

  // A deletion never publishes by the row's press alone: it opens a
  // confirmation carrying the origin/HEAD tree the row was painted from (#580).
  const deletion = usePromoteDeletion();
  const deletionWrite = useWriteAction(deletion, {
    screen,
    action: "delete",
    subject: landsIn("pending-review"),
    failure: (error) =>
      deletionNotice(error, deletion.variables?.type ?? "skill"),
  });
  const deleteLocal = useDeleteLocalPrimitive();
  const deleteLocalWrite = useWriteAction(deleteLocal, {
    screen,
    action: "delete",
    // The working tree's row: a Deletion in place, or gone where it was local only.
    subject: landsIn("pending-proposal"),
    failure: (error) =>
      localDeletionNotice(error, {
        type: deleteLocal.variables?.type ?? "skill",
        name: deleteLocal.variables?.name ?? "",
        screen: "harness",
      }),
  });
  const [confirming, setConfirming] = useState<PrimitiveRef | null>(null);
  const pendingDeletion =
    confirming === null
      ? null
      : (proposalRows(state).find(
          (row) => row.type === confirming.type && row.name === confirming.name,
        ) ?? null);
  // Frozen at the press: two stages carry Delete skill, and the row it came
  // from turns into a Deletion once the folder is gone.
  const [localDeletion, setLocalDeletion] =
    useState<LocalDeletionTarget | null>(null);

  // The press freezes what it was made against, so a check landing while the
  // confirmation stands cannot rewrite the source or close it (#915).
  const restore = useRestorePrimitive();
  // A status left unread is the outcome notice above the table instead.
  const restoreWrite = useWriteAction(restore, {
    screen,
    action: "restore",
    subject: (restored) =>
      restored.statusRead
        ? {
            name: phrase`${named(restored.name)}`,
            row: pressedRow("pending-proposal", restored),
          }
        : null,
    failure: (error) =>
      restoreNotice(error, restore.variables?.type ?? "skill"),
  });
  const [restoring, setRestoring] = useState<RestoreTarget | null>(null);

  const discard = useDiscardChange();
  const discardWrite = useWriteAction(discard, {
    screen,
    action: "discard",
    subject: landsIn("pending-proposal"),
    failure: (error) =>
      discardNotice(error, {
        type: discard.variables?.type ?? "skill",
        name: discard.variables?.name ?? "",
      }),
  });
  // Frozen at the press, like a restore: a later read never rewrites the tree
  // the author confirms.
  const [discarding, setDiscarding] = useState<DiscardTarget | null>(null);

  // Frozen at the press: the dialog's copy follows the row it was opened from.
  const [releaseWithdrawalTarget, setReleaseWithdrawing] =
    useState<ReleaseWithdrawalTarget | null>(null);
  // Its open pull requests come from the latest read: a refusal re-reads
  // GitHub, and the notice names what it found.
  const releaseWithdrawing: ReleaseWithdrawalItem | null =
    releaseWithdrawalTarget === null
      ? null
      : {
          ...releaseWithdrawalTarget,
          openRequests:
            releaseRows(state).find(
              (row) =>
                row.type === releaseWithdrawalTarget.type &&
                row.name === releaseWithdrawalTarget.name,
            )?.openRequests ?? null,
        };
  const releaseWithdrawal = useWithdrawFromRelease();
  const releaseWithdrawalWrite = useWriteAction(releaseWithdrawal, {
    screen,
    action: "withdrawFromRelease",
    // The row the withdrawal leaves under Pending proposal, which the server
    // names: for a rename, the old name's.
    subject: (withdrawn, pressed) => ({
      name: withdrawn.name,
      row: pressedRow("pending-proposal", {
        type: pressed.type,
        name: withdrawn.name,
      }),
    }),
    // A failure shows only in the dialog, so its item stands.
    failure: (error) =>
      releaseWithdrawing === null
        ? null
        : releaseWithdrawalNotice(error, releaseWithdrawing),
  });

  const proposalAction = useProposalAction();
  const [withdrawing, setWithdrawing] = useState<WithdrawTarget | null>(null);
  const proposalWrite = useWriteAction(proposalAction, {
    screen,
    action: ({ action }) => action,
    // Create and reopen keep the row in Pending review. A withdrawn item
    // leaves every stage, so the screen states it in a toast.
    subject: landsIn("pending-review"),
    failure: (error) =>
      proposalAction.variables?.action === "withdraw" && withdrawing !== null
        ? withdrawNotice(error, {
            type: withdrawing.type,
            name: withdrawing.name,
            branch: withdrawing.branch,
            defaultBranch: state?.defaultBranch ?? null,
            number: withdrawing.number,
          })
        : proposalNotice(error),
  });
  const proposalSkill = proposalAction.variables ?? null;
  const proposalFailure = proposalWrite.failure;

  // One refusal at a time, stated on the row the press was made from. A
  // withdrawal's refusal belongs to its dialog, where the confirmation still
  // stands (#577, #580).
  const failure = (): { id: string; notice: NoticeContent } | null => {
    if (
      promoteFailure !== null &&
      promotedSkill !== null &&
      promotedFrom !== null
    ) {
      return {
        id: pressedRow(promotedFrom, promotedSkill),
        notice: promoteFailure,
      };
    }
    if (
      withdrawing === null &&
      proposalFailure !== null &&
      proposalSkill !== null
    ) {
      return {
        id: pressedRow("pending-review", proposalSkill),
        notice: proposalFailure,
      };
    }
    return null;
  };

  // The row whose press is writing, so its ⋮ and foot button spin. A
  // withdrawal runs from its dialog, which shows its own.
  const proposing = proposalAction.variables;
  const running: (RunningPress & { id: string }) | null =
    promote.isPending && promotedSkill !== null && promotedFrom !== null
      ? {
          id: pressedRow(promotedFrom, promotedSkill),
          action: "propose",
          number: null,
        }
      : proposalAction.isPending &&
          proposing !== undefined &&
          proposing.action !== "withdraw"
        ? {
            id: pressedRow("pending-review", proposing),
            action: proposing.action,
            number: proposing.number ?? null,
          }
        : null;

  // The row a landed push moved to. It always lands in Pending review,
  // whichever stage it was pressed in — the branch is now ahead (#581, #865).
  const movedSkill = promote.isSuccess
    ? promotedSkill
    : deletion.isSuccess
      ? (deletion.variables ?? null)
      : null;
  const withdrawnFromRelease =
    releaseWithdrawal.isSuccess && releaseWithdrawal.variables !== undefined
      ? pressedRow("pending-proposal", {
          type: releaseWithdrawal.variables.type,
          name: releaseWithdrawal.data.name,
        })
      : null;
  const movedTo =
    movedSkill === null
      ? withdrawnFromRelease
      : pressedRow("pending-review", movedSkill);

  // Edit prompt opens a dialog flow the view holds.
  const handlers: Omit<RowActionHandlers, "edit"> = {
    promote: (row) => {
      setPromotedFrom(row.stage);
      if (row.change === "deletion") {
        deletion.reset();
        setConfirming({ type: row.type, name: row.name });
        return;
      }
      promoteWrite.run({ type: row.type, name: row.name });
    },
    create: (row) =>
      proposalWrite.run({ action: "create", type: row.type, name: row.name }),
    reopen: (row, number) =>
      proposalWrite.run({
        action: "reopen",
        type: row.type,
        name: row.name,
        number,
      }),
    withdraw: (row, number) => {
      proposalAction.reset();
      setWithdrawing({
        type: row.type,
        name: row.name,
        branch: row.branch,
        number,
      });
    },
    deleteLocal: (row) => {
      deleteLocal.reset();
      setLocalDeletion({
        type: row.type,
        name: row.name,
        path: row.path,
        localOnly: row.localOnly,
      });
    },
    discard: (row) => {
      if (!offersDiscard(row)) {
        return;
      }
      discard.reset();
      setDiscarding({
        type: row.type,
        name: row.name,
        path: row.path,
        seenRemoteTree: row.remoteTree,
      });
    },
    withdrawFromRelease: (row) => {
      releaseWithdrawal.reset();
      setReleaseWithdrawing({
        type: row.type,
        name: row.name,
        path: row.path,
        change: row.change,
        previousName: row.previousName,
      });
    },
    restore: (row, commit) => {
      restore.reset();
      setRestoring({
        type: row.type,
        name: row.name,
        path: row.path,
        commit,
        hasRequest: row.requests.length > 0,
      });
    },
  };

  return {
    promote,
    deletion,
    deleteLocal,
    restore,
    discard,
    proposalAction,
    deletionWrite,
    deleteLocalWrite,
    restoreWrite,
    discardWrite,
    releaseWithdrawalWrite,
    proposalWrite,
    handlers,
    running,
    failure,
    movedTo,
    pendingDeletion,
    // Left unreset, so a landed deletion still names the row that just moved
    // after its dialog closes. The next press resets it (#580, #581).
    closeConfirmation: () => setConfirming(null),
    localDeletion,
    closeLocalDeletion: () => setLocalDeletion(null),
    restoring,
    closeRestore: () => setRestoring(null),
    discarding,
    closeDiscard: () => setDiscarding(null),
    withdrawing,
    closeWithdrawal: () => setWithdrawing(null),
    releaseWithdrawing,
    closeReleaseWithdrawal: () => setReleaseWithdrawing(null),
  };
}

function releaseRows(state: HarnessState | undefined): HarnessStageRow[] {
  const stage = state?.stages.release;
  return stage?.outcome === "read" ? stage.rows : [];
}

// Pending proposal's rows, or none where the stage could not be read: a press
// aimed at a row nobody read is refused here rather than sent.
function proposalRows(state: HarnessState | undefined): HarnessStageRow[] {
  const stage = state?.stages.proposal;
  return stage?.outcome === "read" ? stage.rows : [];
}
