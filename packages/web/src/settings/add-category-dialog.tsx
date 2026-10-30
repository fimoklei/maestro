import {
  ADD_A_CATEGORY,
  ADD_CATEGORY,
  CATEGORY_NAME_LABEL,
} from "../categories/categories-copy";
import { Dialog } from "../ui/dialog";
import { Field } from "../ui/field";
import type { NoticeContent } from "../ui/notice";

// Adds one category by name (#1719). The host owns the field and the add.
export function AddCategoryDialog({
  name,
  onNameChange,
  error,
  failure,
  busy,
  onAdd,
  onClose,
}: {
  name: string;
  onNameChange: (name: string) => void;
  /** The field's own refusal, shown once the reader pressed Add category. */
  error: string | undefined;
  /** A refusal that is not about the name. */
  failure: NoticeContent | null;
  busy: boolean;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={ADD_A_CATEGORY}
      version={null}
      width={480}
      phase={busy ? "running" : "idle"}
      action={{
        label: ADD_CATEGORY,
        verb: "add",
        tone: "primary",
        unavailable: null,
        onRun: onAdd,
      }}
      failure={failure}
      describedBy={null}
      fieldsChanged={name !== ""}
      onClose={onClose}
    >
      <Field
        label={CATEGORY_NAME_LABEL}
        error={error}
        value={name}
        onChange={onNameChange}
        readOnly={busy}
        autoComplete="off"
      />
    </Dialog>
  );
}
