import { useId } from "react";
import { Dialog } from "../ui/dialog";
import { PathField } from "../ui/path-field";
import type { FolderChooser } from "../ui/use-folder-chooser";
import {
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
  phase,
  onRegister,
  onClose,
}: {
  path: string;
  onPathChange: (path: string) => void;
  onPicked: (path: string) => void;
  chooser: FolderChooser;
  /** The refusal for the path in the field, stated under it. */
  error: string | undefined;
  phase: "idle" | "running";
  onRegister: () => void;
  onClose: () => void;
}) {
  const promiseId = useId();

  return (
    <Dialog
      title={REGISTER_TITLE}
      version={null}
      width={480}
      phase={phase}
      action={{
        label: REGISTER_REPOSITORY,
        verb: "register",
        tone: "primary",
        unavailable: null,
        onRun: onRegister,
      }}
      // The refusal belongs to the field and is stated beside it.
      failure={null}
      describedBy={promiseId}
      fieldsChanged={path !== ""}
      onClose={onClose}
    >
      <PathField
        label={FOLDER_LABEL}
        hint={FOLDER_HINT}
        value={path}
        onChange={onPathChange}
        onPicked={onPicked}
        chooser={chooser}
        error={error}
        readOnly={phase === "running"}
        // Pasting is always possible, so no browser guess gets in the way.
        autoComplete="off"
        spellCheck={false}
      />
      <p id={promiseId} className="m-0 text-gray-11">
        {WRITE_PROMISE}
      </p>
    </Dialog>
  );
}
