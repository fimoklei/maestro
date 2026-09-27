import { Card } from "../ui/card";
import { Dialog } from "../ui/dialog";
import { Fact } from "../ui/fact";
import type { NoticeContent } from "../ui/notice";

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
    <Dialog
      title={`Withdraw proposal for ${skill}`}
      version={null}
      width={480}
      phase={withdrawing ? "running" : "idle"}
      action={{
        label: "Withdraw proposal",
        verb: "withdraw",
        tone: "danger",
        unavailable: null,
        onRun: onConfirm,
      }}
      failure={withdrawError}
      // The consequences sit in the body, read in the order they are written.
      describedBy={null}
      fieldsChanged={false}
      onClose={onClose}
    >
      <p className="m-0">
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
    </Dialog>
  );
}
