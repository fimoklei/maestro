import type {
  HarnessStage,
  HarnessStageRow,
  HarnessState,
  PrimitiveRef,
} from "@maestro/core";
import { useState } from "react";
import type { NoticeContent } from "../ui/notice";
import { named, phrase } from "../ui/phrase";
import { useWriteAction } from "../ui/use-write-action";
import { rowId } from "./harness-columns";
import type {
  DiscardTarget,
  LocalDeletionTarget,
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
} from "./use-harness";

const primitiveName = (_data: unknown, { name }: { name: string }) => name;

// The row a press lands on, named by the request it sent.
const pressedRow = (stage: HarnessStage, { type, name }: PrimitiveRef) =>
  rowId({ stage, type, name });

export function useHarnessPresses(
  state: HarnessState | undefined,
  /** Into the Harness screen's status region. */
  report: (write: string) => void,
) {
  const promote = usePromotePrimitive();
  const promoteWrite = useWriteAction(promote, {
    report,
    action: "propose",
    show: "row",
    name: primitiveName,
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
    report,
    action: "delete",
    show: "row",
    name: primitiveName,
    failure: (error) =>
      deletionNotice(error, deletion.variables?.type ?? "skill"),
  });
  const deleteLocal = useDeleteLocalPrimitive();
  const deleteLocalWrite = useWriteAction(deleteLocal, {
    report,
    action: "delete",
    show: "row",
    name: primitiveName,
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
    report,
    action: "restore",
    show: "toast",
    name: (restored) =>
      restored.statusRead ? phrase`${named(restored.name)}` : null,
    failure: (error) =>
      restoreNotice(error, restore.variables?.type ?? "skill"),
  });
  const [restoring, setRestoring] = useState<RestoreTarget | null>(null);

  const discard = useDiscardChange();
  const discardWrite = useWriteAction(discard, {
    report,
    action: "discard",
    show: "row",
    name: primitiveName,
    failure: (error) =>
      discardNotice(error, {
        type: discard.variables?.type ?? "skill",
        name: discard.variables?.name ?? "",
      }),
  });
  // Frozen at the press, like a restore: a later read never rewrites the tree
  // the author confirms.
  const [discarding, setDiscarding] = useState<DiscardTarget | null>(null);

  const proposalAction = useProposalAction();
  const proposalWrite = useWriteAction(proposalAction, {
    report,
    action: ({ action }) => action,
    show: "row",
    name: primitiveName,
    failure: proposalNotice,
  });
  const proposalSkill = proposalAction.variables ?? null;
  const proposalFailure = proposalWrite.failure;
  const [withdrawing, setWithdrawing] = useState<WithdrawTarget | null>(null);

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
  const movedTo =
    movedSkill === null ? null : pressedRow("pending-review", movedSkill);

  const handlers: RowActionHandlers = {
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
  };
}

// Pending proposal's rows, or none where the stage could not be read: a press
// aimed at a row nobody read is refused here rather than sent.
function proposalRows(state: HarnessState | undefined): HarnessStageRow[] {
  const stage = state?.stages.proposal;
  return stage?.outcome === "read" ? stage.rows : [];
}
