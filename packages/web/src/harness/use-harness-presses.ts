import type { HarnessState } from "@maestro/core";
import { useState } from "react";
import type { NoticeContent } from "../ui/notice";
import { rowId } from "./harness-columns";
import type { RestoreTarget } from "./harness-dialogs";
import { promoteNotice, proposalNotice } from "./notice-copy";
import type { RowActionHandlers } from "./row-actions";
import type { HarnessStage, HarnessStageRow } from "./use-harness";
import {
  useDeleteLocalSkill,
  usePromoteDeletion,
  usePromoteSkill,
  useProposalAction,
  useRestoreSkill,
} from "./use-harness";

export function useHarnessPresses(state: HarnessState | undefined) {
  const promote = usePromoteSkill();
  const promotedSkill = promote.variables?.name ?? null;
  const promoteFailure = promoteNotice(promote.error);
  // The stage the press was made in. Propose change sits in two of them, and a
  // refusal belongs to the row it was pressed from, not to the skill (#865).
  const [promotedFrom, setPromotedFrom] = useState<HarnessStage | null>(null);

  // A deletion never publishes by the row's press alone: it opens a
  // confirmation carrying the origin/HEAD tree the row was painted from (#580).
  const deletion = usePromoteDeletion();
  const deleteLocal = useDeleteLocalSkill();
  const [confirming, setConfirming] = useState<string | null>(null);
  const pendingDeletion =
    proposalRows(state).find((row) => row.skill === confirming) ?? null;

  // The press freezes what it was made against, so a check landing while the
  // confirmation stands cannot rewrite the source or close it (#915).
  const restore = useRestoreSkill();
  const [restoring, setRestoring] = useState<RestoreTarget | null>(null);

  const proposalAction = useProposalAction();
  const proposalSkill = proposalAction.variables?.name ?? null;
  const proposalFailure = proposalNotice(proposalAction.error);
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
      promote.mutate({ name: row.skill });
    },
    create: (skill) => proposalAction.mutate({ action: "create", name: skill }),
    reopen: (skill, number) =>
      proposalAction.mutate({ action: "reopen", name: skill, number }),
    withdraw: (skill, number) => {
      proposalAction.reset();
      setWithdrawing({ skill, number });
    },
    deleteLocal: (skill) => {
      deleteLocal.reset();
      setConfirming(skill);
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
    handlers,
    failure,
    movedTo,
    pendingDeletion,
    // Left unreset, so a landed deletion still names the row that just moved
    // after its dialog closes. The next press resets it (#580, #581).
    closeConfirmation: () => setConfirming(null),
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
