import type { HarnessPrimitiveType } from "@maestro/core";
import { BRANCH_FACT } from "../ui/band-copy";
import { Card } from "../ui/card";
import { Dialog } from "../ui/dialog";
import { Fact } from "../ui/fact";
import { Notice, type NoticeContent } from "../ui/notice";
import { PhraseText } from "../ui/phrase-text";
import { StatusLine } from "../ui/status-line";
import {
  DEFAULT_BRANCH_COMMIT_FACT,
  DEFAULT_BRANCH_COMMIT_HINT,
  DELETION_COPY,
  deleteFromOrigin,
  deletionTitle,
  openRequestNotice,
  uncommittedNotice,
} from "./deletion-copy";
import { DELETION_CHECKING } from "./dialog-copy";
import { ITEM_WORDS } from "./item-words";
import type { LocalDeletionContext } from "./local-deletion-copy";

// The two roads a Harness item's deletion takes. Proposing it needs the exact
// origin/HEAD copy the confirmation is given against (#580), and the open
// request it turns into a deletion; removing it on disk needs the folder that
// goes (#798), read fresh while the dialog stands. `localOnly` picks the copy:
// a skill in no ref is gone for good, one on the default branch is step 1 of a
// proposed deletion (#1370).
export type DeletionMode =
  | {
      kind: "propose";
      origin: string;
      branch: string;
      seenRemoteTree: string;
      openRequest: { number: number; author: string } | null;
    }
  | {
      kind: "local";
      origin: string;
      screen: LocalDeletionContext["screen"];
      path: string;
      check: "checking" | "failed" | "not-in-clone" | "ready";
      localOnly: boolean;
      uncommitted: boolean;
    };

export function DeletionDialog({
  type,
  name,
  mode,
  onClose,
  onConfirm,
  deleting,
  deleteError,
}: {
  type: HarnessPrimitiveType;
  name: string;
  mode: DeletionMode;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
  deleteError: NoticeContent | null;
}) {
  const copy = DELETION_COPY[type];
  return (
    <Dialog
      title={deletionTitle(name)}
      version={null}
      width={480}
      phase={deleting ? "running" : "idle"}
      action={{
        label: copy.label,
        verb: "delete",
        tone: "danger",
        unavailable:
          mode.kind !== "local" || mode.check === "ready"
            ? null
            : mode.check === "checking"
              ? DELETION_CHECKING
              : // The caller states a failed or empty check in `deleteError`;
                // without it the action still stays blocked.
                (deleteError?.label ?? ""),
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
              <PhraseText copy={copy.proposes(mode.origin)} />
            </p>
          ) : null}
          <p className="m-0 text-gray-11">
            <PhraseText copy={copy.keeps(name)} />
          </p>
        </>
      ) : mode.localOnly ? (
        // No second sentence: the other modes name what keeps the item,
        // and here nothing does.
        <p className="m-0">
          <PhraseText copy={copy.localOnly(name)} />
        </p>
      ) : (
        <>
          <p className="m-0">
            <PhraseText copy={copy.inClone(name, mode.origin)} />
          </p>
          <p className="m-0 text-gray-11">
            <PhraseText copy={deleteFromOrigin(mode.origin, mode.screen)} />
          </p>
        </>
      )}
      <Card padded>
        <dl className="flex flex-wrap gap-x-panel gap-y-cell">
          {/* A name has no break in it, and the branch carries the same name
              again. */}
          <Fact
            label={ITEM_WORDS[type].Noun}
            value={name}
            wrap
            machine={false}
          />
          {mode.kind === "propose" ? (
            <>
              <Fact label={BRANCH_FACT} value={mode.branch} wrap />
              {/* The whole hash: the exact origin/HEAD copy the confirmation
                  is given against (#580). */}
              <Fact
                label={DEFAULT_BRANCH_COMMIT_FACT}
                value={mode.seenRemoteTree}
                wrap
                hint={DEFAULT_BRANCH_COMMIT_HINT}
              />
            </>
          ) : (
            <Fact label={ITEM_WORDS[type].Holder} value={mode.path} wrap />
          )}
        </dl>
      </Card>
      {mode.kind === "local" && mode.check === "checking" ? (
        <StatusLine>{DELETION_CHECKING}</StatusLine>
      ) : null}
      <Notice
        trigger="load"
        notice={
          mode.kind === "propose"
            ? openRequestNotice(type, name, mode.openRequest)
            : mode.uncommitted && !mode.localOnly
              ? uncommittedNotice(type, name, mode.origin)
              : null
        }
      />
    </Dialog>
  );
}
