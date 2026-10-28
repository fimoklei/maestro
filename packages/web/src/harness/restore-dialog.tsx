import type { HarnessPrimitiveType } from "@maestro/core";
import { RESTORE_LABEL } from "../ui/control-labels";
import type { NoticeContent } from "../ui/notice";
import {
  RESTORE_KEEPS_PROPOSAL,
  RESTORED_FROM_FACT,
  RESTORED_FROM_HINT,
  restoreBody,
  restoreTitle,
} from "./dialog-copy";
import { HarnessConfirmation } from "./harness-confirmation";
import { ITEM_WORDS } from "./item-words";

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
    <HarnessConfirmation
      type={type}
      name={name}
      title={restoreTitle(name)}
      action={{
        label: RESTORE_LABEL[type],
        verb: "restore",
        unavailable: null,
        run: onConfirm,
      }}
      running={restoring}
      failure={restoreError}
      changes={restoreBody(type)}
      stays={hasRequest ? RESTORE_KEEPS_PROPOSAL : null}
      facts={[
        { label: ITEM_WORDS[type].Holder, value: path },
        // The whole hash: the one commit the confirmation is given against,
        // re-read at the press.
        { label: RESTORED_FROM_FACT, value: commit, hint: RESTORED_FROM_HINT },
      ]}
      checking={null}
      loadNotice={null}
      onClose={onClose}
    />
  );
}
