import type { HarnessPrimitiveType } from "@maestro/core";
import { useId } from "react";
import { Card } from "../ui/card";
import { Dialog } from "../ui/dialog";
import { Fact } from "../ui/fact";
import { Notice, type NoticeContent } from "../ui/notice";
import { PhraseText } from "../ui/phrase-text";
import { StatusLine } from "../ui/status-line";
import {
  DELETION_COPY,
  deleteFromOrigin,
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
  const checkingId = useId();
  return (
    <Dialog
      title={`Delete ${name}`}
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
              ? { describedBy: checkingId }
              : // The caller states a failed or empty check in `deleteError`.
                { failure: true },
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
              <Fact label="Branch" value={mode.branch} wrap />
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
            <Fact label={ITEM_WORDS[type].Holder} value={mode.path} wrap />
          )}
        </dl>
      </Card>
      {mode.kind === "local" && mode.check === "checking" ? (
        <StatusLine id={checkingId}>{DELETION_CHECKING}</StatusLine>
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
