import { trimCategoryName } from "@maestro/core/category-name";
import {
  CATEGORY_NAME_LABEL,
  CHANGE_THE_NAME,
  RENAME_CATEGORY,
  renameCategoryTitle,
  renameHint,
} from "../categories/categories-copy";
import { Dialog } from "../ui/dialog";
import { Field } from "../ui/field";
import type { NoticeContent } from "../ui/notice";

type Category = { name: string; skills: number; prompts: number };

// Renames one category (#1721). The host owns the field and the rename.
export function RenameCategoryDialog({
  category,
  name,
  onNameChange,
  error,
  failure,
  busy,
  onRename,
  onClose,
}: {
  category: Category;
  name: string;
  onNameChange: (name: string) => void;
  /** The field's own refusal, shown once the reader pressed Rename category. */
  error: string | undefined;
  /** A refusal that is not about the name. */
  failure: NoticeContent | null;
  busy: boolean;
  onRename: () => void;
  onClose: () => void;
}) {
  // A change of case only is a change.
  const unchanged = trimCategoryName(name) === category.name;
  return (
    <Dialog
      title={renameCategoryTitle(category.name)}
      version={null}
      width={480}
      phase={busy ? "running" : "idle"}
      action={{
        label: RENAME_CATEGORY,
        verb: "rename",
        tone: "primary",
        unavailable: unchanged ? CHANGE_THE_NAME : null,
        onRun: onRename,
      }}
      failure={failure}
      describedBy={null}
      fieldsChanged={name !== category.name}
      onClose={onClose}
    >
      <Field
        label={CATEGORY_NAME_LABEL}
        hint={renameHint(category.skills, category.prompts)}
        error={error}
        value={name}
        onChange={onNameChange}
        // Opens with the name selected, so typing replaces it.
        onFocus={(event) => event.currentTarget.select()}
        readOnly={busy}
        autoComplete="off"
      />
    </Dialog>
  );
}
