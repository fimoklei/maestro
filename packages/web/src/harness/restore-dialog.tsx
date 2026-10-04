import { Card } from "../ui/card";
import { RESTORE_SKILL } from "../ui/control-labels";
import { Dialog } from "../ui/dialog";
import { Fact } from "../ui/fact";
import type { NoticeContent } from "../ui/notice";

export function RestoreDialog({
  skill,
  folder,
  commit,
  hasRequest,
  onClose,
  onConfirm,
  restoring,
  restoreError,
}: {
  skill: string;
  folder: string;
  commit: string;
  // A proposal over this skill is untouched by a restore, said here rather
  // than left for the author to wonder about after the press.
  hasRequest: boolean;
  onClose: () => void;
  onConfirm: () => void;
  restoring: boolean;
  restoreError: NoticeContent | null;
}) {
  return (
    <Dialog
      title={`Restore ${skill}`}
      version={null}
      width={480}
      phase={restoring ? "running" : "idle"}
      // Uncommitted work is thrown away: confirmed like a deletion.
      action={{
        label: RESTORE_SKILL,
        verb: "restore",
        tone: "danger",
        unavailable: null,
        onRun: onConfirm,
      }}
      failure={restoreError}
      // The consequences sit in the body, read in the order they are written.
      describedBy={null}
      fieldsChanged={false}
      onClose={onClose}
    >
      <p className="m-0">
        {RESTORE_SKILL} brings back the folder from your last local commit.
        Later changes do not come back.
      </p>
      {hasRequest ? (
        <p className="m-0 text-gray-11">Your proposal remains unchanged.</p>
      ) : null}
      <Card padded>
        <dl className="flex flex-wrap gap-x-panel gap-y-cell">
          <Fact label="Skill" value={skill} wrap />
          <Fact label="Folder" value={folder} wrap />
          {/* The whole hash: the one commit the confirmation is given
              against, re-read at the press. */}
          <Fact
            label="Restored from"
            value={commit}
            wrap
            hint="Your last local commit. If it moves before you confirm, nothing is restored."
          />
        </dl>
      </Card>
    </Dialog>
  );
}
