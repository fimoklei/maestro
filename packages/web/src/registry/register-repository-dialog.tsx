import { useId } from "react";
import { ACTIONS } from "../ui/busy-copy";
import { Button } from "../ui/button";
import { DialogHeader } from "../ui/dialog-header";
import { DIALOG_FOOTER, DialogShell } from "../ui/dialog-shell";
import { PathField } from "../ui/path-field";
import type { FolderChooser } from "../ui/use-folder-chooser";
import {
  CANCEL,
  FOLDER_HINT,
  FOLDER_LABEL,
  REGISTER_REPOSITORY,
  REGISTER_TITLE,
  WRITE_PROMISE,
} from "./repositories-copy";

// One folder per registration (#1009). Presentational: the host owns the
// field's value, the after-pick check and the registration.
export function RegisterRepositoryDialog({
  path,
  onPathChange,
  onPicked,
  chooser,
  error,
  busy,
  onRegister,
  onClose,
}: {
  path: string;
  onPathChange: (path: string) => void;
  onPicked: (path: string) => void;
  chooser: FolderChooser;
  /** The refusal for the path in the field, stated under it. */
  error: string | undefined;
  busy: boolean;
  onRegister: () => void;
  onClose: () => void;
}) {
  const promiseId = useId();

  return (
    <DialogShell
      label={REGISTER_TITLE}
      // The field states its own hint and refusal beside it.
      describedBy={null}
      width={480}
      onClose={onClose}
      closeEnabled={!busy}
      fieldsChanged={path !== ""}
    >
      <form
        className="flex min-h-0 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onRegister();
        }}
      >
        <DialogHeader title={REGISTER_TITLE} busy={busy} onClose={onClose} />
        <div className="flex min-h-0 flex-col gap-panel overflow-y-auto p-panel">
          <PathField
            label={FOLDER_LABEL}
            hint={FOLDER_HINT}
            value={path}
            onChange={onPathChange}
            onPicked={onPicked}
            chooser={chooser}
            error={error}
            readOnly={busy}
            // Pasting is always possible, so no browser guess gets in the way.
            autoComplete="off"
            spellCheck={false}
          />
          <p id={promiseId} className="m-0 font-ui text-gray-11 text-meta">
            {WRITE_PROMISE}
          </p>
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
            variant="primary"
            busy={busy}
            aria-describedby={promiseId}
          >
            {busy ? ACTIONS.register.busy : REGISTER_REPOSITORY}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}
