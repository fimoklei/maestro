import { useEffect, useId, useRef } from "react";
import { ACTIONS } from "../ui/busy-copy";
import { Button } from "../ui/button";
import { DialogHeader } from "../ui/dialog-header";
import { DIALOG_FOOTER, DialogShell } from "../ui/dialog-shell";
import { Notice, type NoticeContent } from "../ui/notice";
import { PathField } from "../ui/path-field";
import type { FolderChooser } from "../ui/use-folder-chooser";
import {
  CANCEL,
  FOLDER_HINT,
  FOLDER_LABEL,
  SET_LOCATION,
} from "./settings-copy";

// Re-points Maestro at another local Harness clone (#995). The host owns the
// field's value and the connect.
export function SetLocationDialog({
  path,
  onPathChange,
  chooser,
  notice,
  busy,
  onSet,
  onClose,
}: {
  path: string;
  onPathChange: (path: string) => void;
  chooser: FolderChooser;
  /** A refusal of the path, or the scaffold offer. */
  notice: NoticeContent | null;
  busy: boolean;
  onSet: () => void;
  onClose: () => void;
}) {
  const noticeId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const initialPath = useRef(path);

  // A refused set hands focus back to the field to fix (#214).
  const refusal = notice?.level === "error" ? notice.label : null;
  useEffect(() => {
    if (refusal !== null) fieldRef.current?.focus();
  }, [refusal]);

  return (
    <DialogShell
      label={SET_LOCATION}
      // The field states its own hint and refusal beside it.
      describedBy={null}
      width={480}
      onClose={onClose}
      closeEnabled={!busy}
      fieldsChanged={path !== initialPath.current}
    >
      <form
        className="flex min-h-0 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onSet();
        }}
      >
        <DialogHeader title={SET_LOCATION} busy={busy} onClose={onClose} />
        <div className="flex min-h-0 flex-col gap-inline overflow-y-auto p-panel">
          <PathField
            label={FOLDER_LABEL}
            hint={FOLDER_HINT}
            value={path}
            onChange={onPathChange}
            chooser={chooser}
            inputRef={fieldRef}
            // An offer is not a malformed field: only an error marks it.
            invalid={notice?.level === "error"}
            describedBy={noticeId}
            readOnly={busy}
            autoComplete="off"
            spellCheck={false}
          />
          <Notice id={noticeId} trigger="user-action" notice={notice} />
        </div>
        <div className={DIALOG_FOOTER}>
          <Button
            type="button"
            variant="quiet"
            disabled={busy}
            onClick={onClose}
          >
            {CANCEL}
          </Button>
          <Button
            type="submit"
            // Steps down whenever the notice owns the primary action (#556).
            variant={notice?.action === undefined ? "primary" : "quiet"}
            busy={busy}
          >
            {busy ? ACTIONS.setLocation.busy : SET_LOCATION}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}
