import type { HarnessPrimitiveType } from "@maestro/core";
import { DEFAULT_BRANCH_FACT, UNKNOWN_FACT_VALUE } from "../ui/band-copy";
import { DISCARD_CHANGE } from "../ui/control-labels";
import type { NoticeContent } from "../ui/notice";
import { discardBody, discardHint, discardTitle } from "./dialog-copy";
import { HarnessConfirmation } from "./harness-confirmation";
import { ITEM_WORDS } from "./item-words";
import { defaultBranchCopy } from "./stage-copy";

// The confirmation a discard takes before the edited item is replaced
// (#1375). Presentational — the host owns the mutation and what the row said.
export function DiscardDialog({
  type,
  name,
  path,
  defaultBranch,
  onClose,
  onConfirm,
  discarding,
  discardError,
}: {
  type: HarnessPrimitiveType;
  name: string;
  path: string;
  // Null where the read could not name it.
  defaultBranch: string | null;
  onClose: () => void;
  onConfirm: () => void;
  discarding: boolean;
  discardError: NoticeContent | null;
}) {
  const branch = defaultBranchCopy(defaultBranch);
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
      changes={discardBody(type, branch)}
      stays={null}
      facts={[
        { label: ITEM_WORDS[type].Holder, value: path },
        {
          label: DEFAULT_BRANCH_FACT,
          value: defaultBranch ?? UNKNOWN_FACT_VALUE,
          machine: defaultBranch !== null,
          hint: discardHint(branch),
        },
      ]}
      checking={null}
      loadNotice={null}
      onClose={onClose}
    />
  );
}
