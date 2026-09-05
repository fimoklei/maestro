import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { DialogShell } from "../ui/dialog-shell";
import { Fact } from "../ui/fact";
import { Notice, type NoticeContent } from "../ui/notice";

// The confirmation a removal takes before anything is pushed: consequences
// first, then the exact origin/HEAD it is given against (#580).
// Presentational — the host owns the mutation and what the row said.
export function DeletionDialog({
  skill,
  origin,
  seenRemoteTree,
  onClose,
  onConfirm,
  removing,
  removeError,
}: {
  skill: string;
  origin: string;
  seenRemoteTree: string;
  onClose: () => void;
  onConfirm: () => void;
  removing: boolean;
  removeError: NoticeContent | null;
}) {
  const heading = `Remove ${skill}`;

  return (
    <DialogShell
      label={heading}
      // The consequences sit in the body, read in the order they are written.
      describedBy={null}
      width={520}
      height="tall"
      onClose={onClose}
      closeEnabled={!removing}
    >
      <div className="flex shrink-0 items-center justify-between gap-2.5 border-line-row border-b px-3.5 py-3">
        <h2 className="font-semibold font-ui text-fg text-subtitle">
          Remove <span className="font-mono">{skill}</span>
        </h2>
      </div>

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3.5 py-3">
        <p className="m-0 font-ui text-desc text-fg-2">
          You deleted <span className="font-mono text-fg">{skill}</span> from
          the Harness working tree. Confirming proposes that removal to{" "}
          <span className="font-mono text-fg">{origin}</span> on its own branch.
        </p>
        <p className="m-0 font-ui text-desc text-muted">
          Nobody loses the skill until the pull request is merged.
        </p>
        <Card padded>
          <dl className="flex flex-wrap gap-x-10 gap-y-3">
            {/* A skill name has no break in it, and the branch carries the
                same name again. */}
            <Fact label="Skill" value={skill} wrap />
            <Fact label="Branch" value={`maestro/${skill}`} wrap />
            {/* The whole hash: the exact origin/HEAD copy the confirmation
                is given against (#580). */}
            <Fact label="Confirmed against" value={seenRemoteTree} wrap />
          </dl>
        </Card>
        <Notice trigger="user-action" notice={removeError} />
      </div>

      <div className="flex shrink-0 items-center gap-2.5 border-line-row border-t px-3.5 py-3">
        <span className="flex-1" />
        <Button
          type="button"
          className="shrink-0"
          variant="quiet"
          size="sm"
          disabled={removing}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="shrink-0"
          variant="primary"
          size="sm"
          disabled={removing}
          onClick={onConfirm}
        >
          {removing ? "Removing…" : "Remove skill"}
        </Button>
      </div>
    </DialogShell>
  );
}
