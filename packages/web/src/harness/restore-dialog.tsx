import type { HarnessPrimitiveType } from "@maestro/core";
import { Card } from "../ui/card";
import { RESTORE_LABEL } from "../ui/control-labels";
import { Dialog } from "../ui/dialog";
import { Fact } from "../ui/fact";
import type { NoticeContent } from "../ui/notice";
import { PhraseText } from "../ui/phrase-text";
import { ITEM_FACTS, RESTORE_BODY } from "./dialog-copy";

export function RestoreDialog({
  type,
  name,
  path,
  commit,
  hasRequest,
  onClose,
  onConfirm,
  restoring,
  restoreError,
}: {
  type: HarnessPrimitiveType;
  name: string;
  path: string;
  commit: string;
  // A proposal over this item is untouched by a restore, said here rather
  // than left for the author to wonder about after the press.
  hasRequest: boolean;
  onClose: () => void;
  onConfirm: () => void;
  restoring: boolean;
  restoreError: NoticeContent | null;
}) {
  return (
    <Dialog
      title={`Restore ${name}`}
      version={null}
      width={480}
      phase={restoring ? "running" : "idle"}
      // Uncommitted work is thrown away: confirmed like a deletion.
      action={{
        label: RESTORE_LABEL[type],
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
        <PhraseText copy={RESTORE_BODY[type]} />
      </p>
      {hasRequest ? (
        <p className="m-0 text-gray-11">Your proposal remains unchanged.</p>
      ) : null}
      <Card padded>
        <dl className="flex flex-wrap gap-x-panel gap-y-cell">
          <Fact
            label={ITEM_FACTS[type].name}
            value={name}
            wrap
            machine={false}
          />
          <Fact label={ITEM_FACTS[type].path} value={path} wrap />
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
