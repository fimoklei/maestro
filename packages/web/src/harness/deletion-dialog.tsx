import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { DialogShell } from "../ui/dialog-shell";
import { Fact } from "../ui/fact";
import { Notice, type NoticeContent } from "../ui/notice";

// The two roads a Harness skill's deletion takes. Proposing it needs the exact
// origin/HEAD copy the confirmation is given against (#580); removing it on
// disk needs the folder that goes (#798).
export type DeletionMode =
  | { kind: "propose"; origin: string; seenRemoteTree: string }
  | { kind: "local"; folder: string };

// The confirmation a deletion takes before anything happens: consequences
// first, then the facts it is given against.
// Presentational — the host owns the mutation and what the row said.
export function DeletionDialog({
  skill,
  mode,
  onClose,
  onConfirm,
  deleting,
  deleteError,
}: {
  skill: string;
  mode: DeletionMode;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
  deleteError: NoticeContent | null;
}) {
  const heading = `Delete ${skill}`;

  return (
    <DialogShell
      label={heading}
      // The consequences sit in the body, read in the order they are written.
      describedBy={null}
      width={520}
      height="tall"
      onClose={onClose}
      closeEnabled={!deleting}
    >
      <div className="flex shrink-0 items-center justify-between gap-2.5 border-line-row border-b px-3.5 py-3">
        <h2 className="font-semibold font-ui text-fg text-subtitle">
          Delete <span className="font-mono">{skill}</span>
        </h2>
      </div>

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3.5 py-3">
        {mode.kind === "propose" ? (
          <>
            <p className="m-0 font-ui text-desc text-fg-2">
              You deleted <span className="font-mono text-fg">{skill}</span>{" "}
              from the Harness working tree. Confirming proposes that deletion
              to <span className="font-mono text-fg">{mode.origin}</span> on its
              own branch.
            </p>
            <p className="m-0 font-ui text-desc text-muted">
              Nobody loses the skill until the pull request is merged.
            </p>
          </>
        ) : (
          // No second sentence: the propose mode has one because nothing is
          // lost until a merge, and here something is.
          <p className="m-0 font-ui text-desc text-fg-2">
            <span className="font-mono text-fg">{skill}</span> is in the Harness
            working tree and nowhere else. Confirming removes the folder from
            disk for good.
          </p>
        )}
        <Card padded>
          <dl className="flex flex-wrap gap-x-10 gap-y-3">
            {/* A skill name has no break in it, and the branch carries the
                same name again. */}
            <Fact label="Skill" value={skill} wrap />
            {mode.kind === "propose" ? (
              <>
                <Fact label="Branch" value={`maestro/${skill}`} wrap />
                {/* The whole hash: the exact origin/HEAD copy the confirmation
                    is given against (#580). The hint says the same thing the
                    confirmation-stale notice does (#885). */}
                <Fact
                  label="Confirmed against"
                  value={mode.seenRemoteTree}
                  wrap
                  hint="The copy on the default branch now. If it moves before you confirm, nothing is pushed."
                />
              </>
            ) : (
              <Fact label="Folder" value={mode.folder} wrap />
            )}
          </dl>
        </Card>
        <Notice trigger="user-action" notice={deleteError} />
      </div>

      <div className="flex shrink-0 items-center gap-2.5 border-line-row border-t px-3.5 py-3">
        <span className="flex-1" />
        <Button
          type="button"
          className="shrink-0"
          variant="quiet"
          size="sm"
          disabled={deleting}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="shrink-0"
          variant="ghost"
          size="sm"
          disabled={deleting}
          onClick={onConfirm}
        >
          {deleting ? "Deleting…" : "Delete skill"}
        </Button>
      </div>
    </DialogShell>
  );
}
