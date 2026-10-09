import { Card } from "../ui/card";
import { DISCARD_CHANGE } from "../ui/control-labels";
import { Dialog } from "../ui/dialog";
import { Fact } from "../ui/fact";
import type { NoticeContent } from "../ui/notice";
import { phrase } from "../ui/phrase";
import { PhraseText } from "../ui/phrase-text";
import { defaultBranchCopy } from "./stage-copy";

// The confirmation a discard takes before the edited folder is replaced
// (#1375). Presentational — the host owns the mutation and what the row said.
export function DiscardDialog({
  skill,
  folder,
  defaultBranch,
  onClose,
  onConfirm,
  discarding,
  discardError,
}: {
  skill: string;
  folder: string;
  // Null where the read could not name it.
  defaultBranch: string | null;
  onClose: () => void;
  onConfirm: () => void;
  discarding: boolean;
  discardError: NoticeContent | null;
}) {
  const branch = defaultBranchCopy(defaultBranch);
  return (
    <Dialog
      title={`${DISCARD_CHANGE} for ${skill}`}
      version={null}
      width={480}
      phase={discarding ? "running" : "idle"}
      // The edit cannot be recovered: confirmed like a deletion.
      action={{
        label: DISCARD_CHANGE,
        verb: "discard",
        tone: "danger",
        unavailable: null,
        onRun: onConfirm,
      }}
      failure={discardError}
      // The consequences sit in the body, read in the order they are written.
      describedBy={null}
      fieldsChanged={false}
      onClose={onClose}
    >
      <p className="m-0">
        <PhraseText
          copy={phrase`This replaces the skill folder in your clone with its copy on ${branch}. You cannot recover your changes. Deployed copies remain unchanged.`}
        />
      </p>
      <Card padded>
        <dl className="flex flex-wrap gap-x-panel gap-y-cell">
          <Fact label="Skill" value={skill} wrap />
          <Fact label="Folder" value={folder} wrap />
          <Fact
            label="Default branch"
            value={defaultBranch ?? "Unknown"}
            wrap
            machine={defaultBranch !== null}
            hint={phrase`If ${branch} moves before you confirm, nothing is discarded.`}
          />
        </dl>
      </Card>
    </Dialog>
  );
}
