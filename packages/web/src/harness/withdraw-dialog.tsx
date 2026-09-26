import { ACTIONS } from "../ui/busy-copy";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { DIALOG_CANCEL, DIALOG_FOOTER, DialogShell } from "../ui/dialog-shell";
import { Fact } from "../ui/fact";
import { Notice, type NoticeContent } from "../ui/notice";

// The confirmation a withdrawal takes before the pull request is closed:
// consequences first, then exactly which request (#809, approved wording).
// Presentational — the host owns the mutation and what the row said.
export function WithdrawDialog({
  skill,
  number,
  onClose,
  onConfirm,
  withdrawing,
  withdrawError,
}: {
  skill: string;
  number: number;
  onClose: () => void;
  onConfirm: () => void;
  withdrawing: boolean;
  withdrawError: NoticeContent | null;
}) {
  return (
    <DialogShell
      label={`Withdraw proposal for ${skill}`}
      // The consequences sit in the body, read in the order they are written.
      describedBy={null}
      width={480}
      destructive
      onClose={onClose}
      closeEnabled={!withdrawing}
    >
      <div className="flex shrink-0 items-center justify-between gap-2.5 border-edge border-b px-3.5 py-3">
        <h2 className="font-semibold font-ui text-gray-12 text-prose">
          Withdraw proposal for <span className="font-mono">{skill}</span>
        </h2>
      </div>

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3.5 py-3">
        <p className="m-0 font-ui text-meta text-gray-12">
          This closes the pull request. Your local files and proposal branch
          remain unchanged.
        </p>
        <Card padded>
          <dl className="flex flex-wrap gap-x-10 gap-y-3">
            <Fact label="Skill" value={skill} wrap />
            <Fact label="Branch" value={`maestro/${skill}`} wrap />
            <Fact label="Pull request" value={`#${number}`} wrap />
          </dl>
        </Card>
        <Notice trigger="user-action" notice={withdrawError} />
      </div>

      <div className={DIALOG_FOOTER}>
        <Button
          type="button"
          className="shrink-0"
          variant="quiet"
          disabled={withdrawing}
          {...DIALOG_CANCEL}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="shrink-0"
          variant="danger"
          busy={withdrawing}
          onClick={onConfirm}
        >
          {withdrawing ? ACTIONS.withdraw.busy : "Withdraw proposal"}
        </Button>
      </div>
    </DialogShell>
  );
}
