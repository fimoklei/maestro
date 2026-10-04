import type {
  HarnessStage,
  HarnessStageRow,
  HarnessState,
} from "@maestro/core";
import { useState } from "react";
import type { NoticeContent } from "../ui/notice";
import { useWriteAction } from "../ui/use-write-action";
import { rowId } from "./harness-columns";
import type { LocalDeletionTarget, RestoreTarget } from "./harness-dialogs";
import {
  deletionNotice,
  localDeletionNotice,
  promoteNotice,
  proposalNotice,
  restoreNotice,
} from "./notice-copy";
import type { RowActionHandlers } from "./row-actions";
import {
  useDeleteLocalSkill,
  usePromoteDeletion,
  usePromoteSkill,
  useProposalAction,
  useRestoreSkill,
} from "./use-harness";

const skillName = (_data: unknown, { name }: { name: string }) => name;

export function useHarnessPresses(
  state: HarnessState | undefined,
  /** Into the Harness screen's status region. */
  report: (write: string) => void,
) {
  const promote = usePromoteSkill();
  const promoteWrite = useWriteAction(promote, {
    report,
    action: "propose",
    show: "row",
    name: skillName,
    failure: promoteNotice,
  });
  const promotedSkill = promote.variables?.name ?? null;
  const promoteFailure = promoteWrite.failure;
  // The stage the press was made in. Propose change sits in two of them, and a
  // refusal belongs to the row it was pressed from, not to the skill (#865).
  const [promotedFrom, setPromotedFrom] = useState<HarnessStage | null>(null);

  // A deletion never publishes by the row's press alone: it opens a
  // confirmation carrying the origin/HEAD tree the row was painted from (#580).
  const deletion = usePromoteDeletion();
  const deletionWrite = useWriteAction(deletion, {
    report,
    action: "propose",
    show: "row",
    name: skillName,
    failure: deletionNotice,
  });
  const deleteLocal = useDeleteLocalSkill();
  const deleteLocalWrite = useWriteAction(deleteLocal, {
    report,
    action: "delete",
    show: "row",
    name: skillName,
    failure: (error) =>
      localDeletionNotice(error, {
        skill: deleteLocal.variables?.name ?? "",
        screen: "harness",
      }),
  });
  const [confirming, setConfirming] = useState<string | null>(null);
  const pendingDeletion =
    proposalRows(state).find((row) => row.skill === confirming) ?? null;
  // Frozen at the press: two stages carry Delete skill, and the row it came
  // from turns into Deleted locally once the folder is gone.
  const [localDeletion, setLocalDeletion] =
    useState<LocalDeletionTarget | null>(null);

  // The press freezes what it was made against, so a check landing while the
  // confirmation stands cannot rewrite the source or close it (#915).
  const restore = useRestoreSkill();
  // The outcome notice above the table states it.
  const restoreWrite = useWriteAction(restore, {
    report,
    action: "restore",
    show: "row",
    name: () => null,
    failure: restoreNotice,
  });
  const [restoring, setRestoring] = useState<RestoreTarget | null>(null);

  const proposalAction = useProposalAction();
  const proposalWrite = useWriteAction(proposalAction, {
    report,
    action: ({ action }) => action,
    show: "row",
    name: skillName,
    failure: proposalNotice,
  });
  const proposalSkill = proposalAction.variables?.name ?? null;
  const proposalFailure = proposalWrite.failure;
  const [withdrawing, setWithdrawing] = useState<{
    skill: string;
    number: number;
  } | null>(null);

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
        id: rowId({ stage: promotedFrom, skill: promotedSkill }),
        notice: promoteFailure,
      };
    }
    if (
      withdrawing === null &&
      proposalFailure !== null &&
      proposalSkill !== null
    ) {
      return {
        id: rowId({ stage: "pending-review", skill: proposalSkill }),
        notice: proposalFailure,
      };
    }
    return null;
  };

  // The row a landed push moved to. It always lands in Pending review,
  // whichever stage it was pressed in — the branch is now ahead (#581, #865).
  const movedSkill = promote.isSuccess
    ? promotedSkill
    : deletion.isSuccess
      ? (deletion.variables?.name ?? null)
      : null;
  const movedTo =
    movedSkill === null
      ? null
      : rowId({ stage: "pending-review", skill: movedSkill });

  const handlers: RowActionHandlers = {
    promote: (row) => {
      setPromotedFrom(row.stage);
      if (row.deletion) {
        deletion.reset();
        setConfirming(row.skill);
        return;
      }
      promoteWrite.run({ name: row.skill });
    },
    create: (skill) => proposalWrite.run({ action: "create", name: skill }),
    reopen: (skill, number) =>
      proposalWrite.run({ action: "reopen", name: skill, number }),
    withdraw: (skill, number) => {
      proposalAction.reset();
      setWithdrawing({ skill, number });
    },
    deleteLocal: (row) => {
      deleteLocal.reset();
      setLocalDeletion({ skill: row.skill, localOnly: row.localOnly });
    },
    restore: (row, commit) => {
      restore.reset();
      setRestoring({
        skill: row.skill,
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
    proposalAction,
    deletionWrite,
    deleteLocalWrite,
    restoreWrite,
    proposalWrite,
    handlers,
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
