import { WITHDRAW_FROM_RELEASE } from "../ui/control-labels";
import type { NoticeContent } from "../ui/notice";
import {
  RELEASE_WITHDRAWAL_CHECKING,
  releaseWithdrawalBody,
  releaseWithdrawalTitle,
} from "./dialog-copy";
import { HarnessConfirmation } from "./harness-confirmation";
import type { ReleaseWithdrawalTarget } from "./harness-dialogs";
import { ITEM_WORDS } from "./item-words";

/** The confirmation's own read: ready, or why it refused. */
export type ReleaseWithdrawalCheck =
  | { kind: "checking" }
  | { kind: "read" }
  | { kind: "refused"; notice: NoticeContent };

// The confirmation a withdrawal from release takes before Maestro pushes to
// GitHub (#1729). Presentational — the host owns the read and the mutation.
export function ReleaseWithdrawalDialog({
  target: { type, name, path, change, previousName },
  check,
  onClose,
  onConfirm,
  withdrawing,
  withdrawError,
}: {
  target: ReleaseWithdrawalTarget;
  check: ReleaseWithdrawalCheck;
  onClose: () => void;
  onConfirm: () => void;
  withdrawing: boolean;
  withdrawError: NoticeContent | null;
}) {
  const body = releaseWithdrawalBody(type, name, change, previousName);
  return (
    <HarnessConfirmation
      type={type}
      name={name}
      title={releaseWithdrawalTitle(name)}
      action={{
        label: WITHDRAW_FROM_RELEASE,
        verb: "withdrawFromRelease",
        unavailable: check.kind === "refused" ? check.notice.label : null,
        run: onConfirm,
      }}
      running={withdrawing}
      // A refused read is a failure like a refused write: Close, not Cancel.
      failure={
        withdrawError ?? (check.kind === "refused" ? check.notice : null)
      }
      changes={body.changes}
      stays={body.stays}
      facts={[{ label: ITEM_WORDS[type].Holder, value: path }]}
      checking={check.kind === "checking" ? RELEASE_WITHDRAWAL_CHECKING : null}
      loadNotice={null}
      onClose={onClose}
    />
  );
}
