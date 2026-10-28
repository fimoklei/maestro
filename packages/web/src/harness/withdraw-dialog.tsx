import type { HarnessPrimitiveType } from "@maestro/core";
import { BRANCH_FACT } from "../ui/band-copy";
import { Card } from "../ui/card";
import { WITHDRAW_PROPOSAL } from "../ui/control-labels";
import { Dialog } from "../ui/dialog";
import { Fact } from "../ui/fact";
import { Notice, type NoticeContent } from "../ui/notice";
import { PhraseText } from "../ui/phrase-text";
import { StatusLine } from "../ui/status-line";
import {
  PULL_REQUEST_FACT,
  UNPROPOSED_UNKNOWN_NOTICE,
  unproposedNotice,
  WITHDRAW_CHECKING,
  withdrawBody,
  withdrawTitle,
} from "./dialog-copy";
import { ITEM_WORDS } from "./item-words";
import { defaultBranchCopy } from "./stage-copy";

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
  defaultBranch,
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
  // Null where the read could not name it.
  defaultBranch: string | null;
  unproposed: UnproposedCheck;
  onClose: () => void;
  onConfirm: () => void;
  withdrawing: boolean;
  withdrawError: NoticeContent | null;
}) {
  return (
    <Dialog
      title={withdrawTitle(name)}
      version={null}
      width={480}
      phase={withdrawing ? "running" : "idle"}
      action={{
        label: WITHDRAW_PROPOSAL,
        verb: "withdraw",
        tone: "danger",
        unavailable: unproposed.kind === "checking" ? WITHDRAW_CHECKING : null,
        onRun: onConfirm,
      }}
      failure={withdrawError}
      // The consequences sit in the body, read in the order they are written.
      describedBy={null}
      fieldsChanged={false}
      onClose={onClose}
    >
      <p className="m-0">
        <PhraseText
          copy={withdrawBody(
            type,
            defaultBranchCopy(defaultBranch),
            number !== null,
          )}
        />
      </p>
      <Card padded>
        <dl className="flex flex-wrap gap-x-panel gap-y-cell">
          <Fact
            label={ITEM_WORDS[type].Noun}
            value={name}
            wrap
            machine={false}
          />
          <Fact label={BRANCH_FACT} value={branch} wrap />
          {number === null ? null : (
            <Fact label={PULL_REQUEST_FACT} value={`#${number}`} wrap />
          )}
        </dl>
      </Card>
      {unproposed.kind === "checking" ? (
        <StatusLine>{WITHDRAW_CHECKING}</StatusLine>
      ) : null}
      <Notice
        trigger="load"
        notice={
          unproposed.kind === "read"
            ? unproposedNotice(unproposed.files)
            : unproposed.kind === "failed"
              ? UNPROPOSED_UNKNOWN_NOTICE
              : null
        }
      />
    </Dialog>
  );
}
