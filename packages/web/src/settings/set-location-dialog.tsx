import { useEffect, useRef } from "react";
import { Dialog } from "../ui/dialog";
import type { NoticeContent } from "../ui/notice";
import { PathField } from "../ui/path-field";
import type { FolderChooser } from "../ui/use-folder-chooser";
import { FOLDER_HINT, FOLDER_LABEL, SET_LOCATION } from "./settings-copy";

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
  const fieldRef = useRef<HTMLInputElement>(null);
  const initialPath = useRef(path);

  // A refused set hands focus back to the field to fix (#214).
  const refusal = notice?.level === "error" ? notice.label : null;
  useEffect(() => {
    if (refusal !== null) fieldRef.current?.focus();
  }, [refusal]);

  return (
    <Dialog
      title={SET_LOCATION}
      version={null}
      width={480}
      phase={busy ? "running" : "idle"}
      action={{
        label: SET_LOCATION,
        verb: "setLocation",
        tone: "primary",
        unavailable: null,
        onRun: onSet,
      }}
      // The scaffold offer's own action steps the footer action down.
      failure={notice}
      // The field states its own hint; a refusal is announced as an alert.
      describedBy={null}
      fieldsChanged={path !== initialPath.current}
      onClose={onClose}
    >
      <PathField
        label={FOLDER_LABEL}
        hint={FOLDER_HINT}
        value={path}
        onChange={onPathChange}
        chooser={chooser}
        inputRef={fieldRef}
        // An offer is not a malformed field: only an error marks it.
        invalid={notice?.level === "error"}
        readOnly={busy}
        autoComplete="off"
        spellCheck={false}
      />
    </Dialog>
  );
}
