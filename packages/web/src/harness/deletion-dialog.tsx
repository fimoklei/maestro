import { Card } from "../ui/card";
import { Dialog } from "../ui/dialog";
import { Fact } from "../ui/fact";
import type { NoticeContent } from "../ui/notice";

// The two roads a Harness skill's deletion takes. Proposing it needs the exact
// origin/HEAD copy the confirmation is given against (#580); removing it on
// disk needs the folder that goes (#798).
export type DeletionMode =
  | { kind: "propose"; origin: string; seenRemoteTree: string }
  | { kind: "local"; folder: string };

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
  return (
    <Dialog
      title={`Delete ${skill}`}
      version={null}
      width={480}
      phase={deleting ? "running" : "idle"}
      action={{
        label: "Delete skill",
        verb: "delete",
        tone: "danger",
        unavailable: null,
        onRun: onConfirm,
      }}
      failure={deleteError}
      // The consequences sit in the body, read in the order they are written.
      describedBy={null}
      fieldsChanged={false}
      onClose={onClose}
    >
      {mode.kind === "propose" ? (
        <>
          <p className="m-0">
            You deleted {skill} from the Harness working tree. Confirming
            proposes that deletion to {mode.origin} on its own branch.
          </p>
          <p className="m-0 text-gray-11">
            Nobody loses the skill until the pull request is merged.
          </p>
        </>
      ) : (
        // No second sentence: the propose mode has one because nothing is
        // lost until a merge, and here something is.
        <p className="m-0">
          {skill} is in the Harness working tree and nowhere else. Confirming
          removes the folder from disk for good.
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
    </Dialog>
  );
}
