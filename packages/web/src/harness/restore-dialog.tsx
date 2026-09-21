import { ACTIONS } from "../ui/busy-copy";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { DialogShell } from "../ui/dialog-shell";
import { Fact } from "../ui/fact";
import { Notice, type NoticeContent } from "../ui/notice";

// The confirmation a restore takes before anything is written: what comes
// back and what does not, then the facts it is given against (ADR-0030).
// Presentational — the host owns the mutation and what the row said.
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
  const heading = `Restore ${skill}`;

  return (
    <DialogShell
      label={heading}
      // The consequences sit in the body, read in the order they are written.
      describedBy={null}
      width={480}
      height="tall"
      onClose={onClose}
      closeEnabled={!restoring}
    >
      <div className="flex shrink-0 items-center justify-between gap-2.5 border-line-row border-b px-3.5 py-3">
        <h2 className="font-semibold font-ui text-fg text-subtitle">
          Restore <span className="font-mono">{skill}</span>
        </h2>
      </div>

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3.5 py-3">
        <p className="m-0 font-ui text-desc text-fg-2">
          Restore this skill folder from your last local commit. Changes not
          included in that commit will not be recovered.
        </p>
        {hasRequest ? (
          <p className="m-0 font-ui text-desc text-muted">
            Your proposal remains unchanged.
          </p>
        ) : null}
        <Card padded>
          <dl className="flex flex-wrap gap-x-10 gap-y-3">
            <Fact label="Skill" value={skill} wrap />
            <Fact label="Folder" value={folder} wrap />
            {/* The whole hash: the one commit the confirmation is given
                against, re-read at the press (ADR-0030). */}
            <Fact
              label="Restored from"
              value={commit}
              wrap
              hint="Your last local commit. If it moves before you confirm, nothing is restored."
            />
          </dl>
        </Card>
        <Notice trigger="user-action" notice={restoreError} />
      </div>

      <div className="flex shrink-0 items-center gap-2.5 border-line-row border-t px-3.5 py-3">
        <span className="flex-1" />
        <Button
          type="button"
          className="shrink-0"
          variant="quiet"
          size="sm"
          disabled={restoring}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="shrink-0"
          variant="ghost"
          size="sm"
          busy={restoring}
          onClick={onConfirm}
        >
          {restoring ? ACTIONS.restore.busy : "Restore skill"}
        </Button>
      </div>
    </DialogShell>
  );
}
