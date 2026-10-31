import type { HarnessPrimitiveType } from "@maestro/core";
import { DISCARD_CHANGE } from "../ui/control-labels";
import type { NoticeContent } from "../ui/notice";
import { DISCARD_HINT, discardBody, discardTitle } from "./dialog-copy";
import { HarnessConfirmation } from "./harness-confirmation";
import { ITEM_WORDS } from "./item-words";

// The confirmation a discard takes before the edited item is replaced
// (#1375). Presentational — the host owns the mutation and what the row said.
export function DiscardDialog({
  type,
  name,
  path,
  onClose,
  onConfirm,
  discarding,
  discardError,
}: {
  type: HarnessPrimitiveType;
  name: string;
  path: string;
  onClose: () => void;
  onConfirm: () => void;
  discarding: boolean;
  discardError: NoticeContent | null;
}) {
  return (
    <HarnessConfirmation
      type={type}
      name={name}
      title={discardTitle(name)}
      action={{
        label: DISCARD_CHANGE,
        verb: "discard",
        unavailable: null,
        run: onConfirm,
      }}
      running={discarding}
      failure={discardError}
      changes={discardBody(type)}
      stays={null}
      facts={[
        // The guarantee: a discard puts back only the copy this dialog read.
        { label: ITEM_WORDS[type].Holder, value: path, hint: DISCARD_HINT },
      ]}
      checking={null}
      loadNotice={null}
      onClose={onClose}
    />
  );
}
