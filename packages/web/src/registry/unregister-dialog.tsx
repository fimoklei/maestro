import { useId } from "react";
import { ACTIONS } from "../ui/busy-copy";
import { Button } from "../ui/button";
import { DialogHeader } from "../ui/dialog-header";
import { DIALOG_CANCEL, DIALOG_FOOTER, DialogShell } from "../ui/dialog-shell";
import { Notice, type NoticeContent } from "../ui/notice";
import {
  CANCEL,
  UNREGISTER_REPOSITORY,
  UNREGISTER_WHAT_STAYS,
  UNREGISTER_WHAT_STOPS,
  unregisterTitle,
} from "./repositories-copy";

// The confirmation an unregister takes (design.md → Feedback and dialogs):
// what stops, then what stays. Presentational — the host owns the mutation.
export function UnregisterDialog({
  name,
  busy,
  failure,
  onConfirm,
  onClose,
}: {
  name: string;
  busy: boolean;
  failure: NoticeContent | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const title = unregisterTitle(name);
  const bodyId = useId();

  return (
    <DialogShell
      label={title}
      describedBy={bodyId}
      width={480}
      destructive
      onClose={onClose}
      closeEnabled={!busy}
    >
      <DialogHeader title={title} busy={busy} onClose={onClose} />
      <div className="flex min-h-0 flex-col gap-inline overflow-y-auto p-panel">
        <div id={bodyId} className="flex flex-col gap-inline">
          <p className="m-0 font-ui text-gray-12 text-prose">
            {UNREGISTER_WHAT_STOPS}
          </p>
          <p className="m-0 font-ui text-gray-11 text-prose">
            {UNREGISTER_WHAT_STAYS}
          </p>
        </div>
        <Notice trigger="user-action" notice={failure} />
      </div>
      <div className={DIALOG_FOOTER}>
        <Button
          variant="quiet"
          disabled={busy}
          {...DIALOG_CANCEL}
          onClick={onClose}
        >
          {CANCEL}
        </Button>
        <Button variant="danger" busy={busy} onClick={onConfirm}>
          {busy ? ACTIONS.unregister.busy : UNREGISTER_REPOSITORY}
        </Button>
      </div>
    </DialogShell>
  );
}
