import type { HarnessChange, HarnessPrimitiveType } from "@maestro/core";
import { WITHDRAW_FROM_RELEASE } from "../ui/control-labels";
import { Dialog } from "../ui/dialog";
import { Notice, type NoticeContent } from "../ui/notice";
import { PhraseText } from "../ui/phrase-text";
import { StatusLine } from "../ui/status-line";
import {
  releaseWithdrawalBody,
  releaseWithdrawalFilesNotice,
  WITHDRAW_CHECKING,
} from "./dialog-copy";

/** The confirmation's own read: the files it replaces, or why it refused. */
export type ReleaseWithdrawalCheck =
  | { kind: "checking" }
  | { kind: "read"; files: readonly string[] }
  | { kind: "refused"; notice: NoticeContent };

// The confirmation a withdrawal from release takes before the Working Harness
// changes (#1642). Presentational — the host owns the read and the mutation.
export function ReleaseWithdrawalDialog({
  type,
  name,
  change,
  previousName,
  check,
  onClose,
  onConfirm,
  withdrawing,
  withdrawError,
}: {
  type: HarnessPrimitiveType;
  name: string;
  change: HarnessChange;
  previousName: string | null;
  check: ReleaseWithdrawalCheck;
  onClose: () => void;
  onConfirm: () => void;
  withdrawing: boolean;
  withdrawError: NoticeContent | null;
}) {
  return (
    <Dialog
      title={`Withdraw ${name} from release`}
      version={null}
      width={480}
      phase={withdrawing ? "running" : "idle"}
      action={{
        label: WITHDRAW_FROM_RELEASE,
        verb: "withdrawFromRelease",
        tone: "danger",
        unavailable:
          check.kind === "checking"
            ? WITHDRAW_CHECKING
            : check.kind === "refused"
              ? check.notice.label
              : null,
        onRun: onConfirm,
      }}
      // A refused read is a failure like a refused write: Close, not Cancel.
      failure={
        withdrawError ?? (check.kind === "refused" ? check.notice : null)
      }
      // The consequences sit in the body, read in the order they are written.
      describedBy={null}
      fieldsChanged={false}
      onClose={onClose}
    >
      <p className="m-0">
        <PhraseText copy={releaseWithdrawalBody(type, change, previousName)} />
      </p>
      {check.kind === "checking" ? (
        <StatusLine>{WITHDRAW_CHECKING}</StatusLine>
      ) : null}
      <Notice
        trigger="load"
        notice={
          check.kind === "read"
            ? releaseWithdrawalFilesNotice(check.files)
            : null
        }
      />
    </Dialog>
  );
}
