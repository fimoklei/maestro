import type { HarnessPrimitiveType } from "@maestro/core";
import { BRANCH_FACT } from "../ui/band-copy";
import { WITHDRAW_PROPOSAL } from "../ui/control-labels";
import type { NoticeContent } from "../ui/notice";
import {
  PULL_REQUEST_FACT,
  UNPROPOSED_UNKNOWN_NOTICE,
  unproposedNotice,
  WITHDRAW_CHECKING,
  withdrawBody,
  withdrawTitle,
} from "./dialog-copy";
import { HarnessConfirmation } from "./harness-confirmation";

/** The files only the clone holds, as the confirmation's own read found them. */
export type UnproposedCheck =
  | { kind: "checking" }
  | { kind: "read"; files: readonly string[] }
  | { kind: "failed" };

// The confirmation a withdrawal takes before the clone, the pull request, if
// one is open, and the branch change (#1638). Presentational — the host owns the reads and the
// mutation.
export function WithdrawDialog({
  type,
  name,
  branch,
  number,
  unproposed,
  onClose,
  onConfirm,
  withdrawing,
  withdrawError,
}: {
  type: HarnessPrimitiveType;
  name: string;
  branch: string;
  // Null where no request is open: there is nothing to close.
  number: number | null;
  unproposed: UnproposedCheck;
  onClose: () => void;
  onConfirm: () => void;
  withdrawing: boolean;
  withdrawError: NoticeContent | null;
}) {
  return (
    <HarnessConfirmation
      type={type}
      name={name}
      title={withdrawTitle(name)}
      action={{
        label: WITHDRAW_PROPOSAL,
        verb: "withdraw",
        unavailable: null,
        run: onConfirm,
      }}
      running={withdrawing}
      failure={withdrawError}
      changes={withdrawBody(type, number !== null)}
      stays={null}
      facts={[
        { label: BRANCH_FACT, value: branch },
        ...(number === null
          ? []
          : [{ label: PULL_REQUEST_FACT, value: `#${number}` }]),
      ]}
      checking={unproposed.kind === "checking" ? WITHDRAW_CHECKING : null}
      // The check is advisory: a failed read warns and leaves the action on.
      loadNotice={
        unproposed.kind === "read"
          ? unproposedNotice(unproposed.files)
          : unproposed.kind === "failed"
            ? UNPROPOSED_UNKNOWN_NOTICE
            : null
      }
      onClose={onClose}
    />
  );
}
