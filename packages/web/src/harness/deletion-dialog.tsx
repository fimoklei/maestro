import { Card } from "../ui/card";
import { DELETE_SKILL, PROPOSE_CHANGE } from "../ui/control-labels";
import { Dialog } from "../ui/dialog";
import { Fact } from "../ui/fact";
import { InlineName } from "../ui/inline-name";
import { Notice, type NoticeContent } from "../ui/notice";
import { named, phrase } from "../ui/phrase";
import { PhraseText } from "../ui/phrase-text";
import { StatusLine } from "../ui/status-line";
import { DELETE_UNAVAILABLE, DELETION_CHECKING } from "./dialog-copy";
import type { LocalDeletionContext } from "./local-deletion-copy";

// The two roads a Harness skill's deletion takes. Proposing it needs the exact
// origin/HEAD copy the confirmation is given against (#580), and the open
// request it turns into a deletion; removing it on disk needs the folder that
// goes (#798), read fresh while the dialog stands. `localOnly` picks the copy:
// a skill in no ref is gone for good, one on the default branch is step 1 of a
// proposed deletion (#1370).
export type DeletionMode =
  | {
      kind: "propose";
      origin: string;
      seenRemoteTree: string;
      openRequest: { number: number; author: string } | null;
    }
  | {
      kind: "local";
      origin: string;
      screen: LocalDeletionContext["screen"];
      folder: string;
      check: "checking" | "failed" | "ready";
      localOnly: boolean;
      uncommitted: boolean;
    };

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
        label: DELETE_SKILL,
        verb: "delete",
        tone: "danger",
        unavailable:
          mode.kind === "local" && mode.check !== "ready"
            ? DELETE_UNAVAILABLE[mode.check]
            : null,
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
          {/* The warning says what this press does instead. */}
          {mode.openRequest === null ? (
            <p className="m-0">
              {DELETE_SKILL} proposes this deletion to{" "}
              <InlineName>{mode.origin}</InlineName> for review.
            </p>
          ) : null}
          <p className="m-0 text-gray-11">
            Your targets keep the skill. After the next release, select Update
            target on each target to remove it.
          </p>
          <Notice
            trigger="load"
            notice={openRequestNotice(skill, mode.openRequest)}
          />
        </>
      ) : mode.localOnly ? (
        // No second sentence: the other modes name what keeps the skill,
        // and here nothing does.
        <p className="m-0">
          {DELETE_SKILL} removes the folder from disk. No other copy of{" "}
          <InlineName>{skill}</InlineName> exists.
        </p>
      ) : (
        <>
          <p className="m-0">
            {DELETE_SKILL} removes the <InlineName>{skill}</InlineName> folder
            from your clone of <InlineName>{mode.origin}</InlineName>. The skill
            stays in <InlineName>{mode.origin}</InlineName> and in your targets.
          </p>
          <p className="m-0 text-gray-11">
            <PhraseText
              copy={
                mode.screen === "harness"
                  ? phrase`To also delete it from ${named(mode.origin)}, select ${PROPOSE_CHANGE}.`
                  : phrase`To also delete it from ${named(mode.origin)}, go to the Harness screen and select ${PROPOSE_CHANGE}.`
              }
            />
          </p>
          <Notice
            trigger="load"
            notice={
              mode.uncommitted
                ? {
                    level: "warning",
                    label: `Uncommitted changes in ${skill}`,
                    message: `${DELETE_SKILL} discards them. To keep them, commit them in your Git tool first.`,
                    detail: phrase`The skill's files in your clone of ${named(mode.origin)} differ from its last commit.`,
                  }
                : null
            }
          />
        </>
      )}
      <Card padded>
        <dl className="flex flex-wrap gap-x-panel gap-y-cell">
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
                label="Default branch commit"
                value={mode.seenRemoteTree}
                wrap
                hint="If someone pushes a commit to the default branch before you confirm, Maestro pushes nothing."
              />
            </>
          ) : (
            <Fact label="Folder" value={mode.folder} wrap />
          )}
        </dl>
      </Card>
      {mode.kind === "local" && mode.check === "checking" ? (
        <StatusLine>{DELETION_CHECKING}</StatusLine>
      ) : null}
    </Dialog>
  );
}

// Several Contributors share one proposal branch, so the request may be a
// teammate's, or an app's.
function openRequestNotice(
  skill: string,
  request: { number: number; author: string } | null,
): NoticeContent | null {
  return request === null
    ? null
    : {
        level: "warning",
        label: `Pull request #${request.number} will delete ${skill} instead`,
        message: phrase`${named(request.author)} opened it to propose changes to ${named(skill)}. ${DELETE_SKILL} replaces those changes with the deletion.`,
      };
}
