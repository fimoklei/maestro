import { useId } from "react";
import {
  DELETE_CATEGORY,
  deleteCategoryTitle,
  deleteMoves,
  emptyCategoryDeleted,
} from "../categories/categories-copy";
import type { HeldCategoryAdd } from "../categories/use-held-category-add";
import { Dialog } from "../ui/dialog";
import type { NoticeContent } from "../ui/notice";
import { PhraseText } from "../ui/phrase-text";
import { MoveToField } from "./move-to-field";

type Category = { name: string; skills: number; prompts: number };

// Deletes one category (#1721). Its items move to another category or to
// none, which is also how two categories merge. The host owns the delete.
export function DeleteCategoryDialog({
  category,
  moveTo,
  onMoveToChange,
  moveToAdd,
  failure,
  busy,
  onDelete,
  onClose,
}: {
  category: Category;
  /** Null for No category. */
  moveTo: string | null;
  onMoveToChange: (moveTo: string | null) => void;
  moveToAdd: HeldCategoryAdd;
  failure: NoticeContent | null;
  busy: boolean;
  onDelete: () => void;
  onClose: () => void;
}) {
  const bodyId = useId();
  const empty = category.skills + category.prompts === 0;
  return (
    <Dialog
      title={deleteCategoryTitle(category.name)}
      version={null}
      width={480}
      phase={busy ? "running" : "idle"}
      action={{
        label: DELETE_CATEGORY,
        verb: "delete",
        tone: "danger",
        unavailable: null,
        onRun: onDelete,
      }}
      failure={failure}
      describedBy={bodyId}
      fieldsChanged={moveTo !== null}
      onClose={onClose}
    >
      <p id={bodyId} className="m-0 text-gray-11">
        {empty ? (
          <PhraseText copy={emptyCategoryDeleted(category.name)} />
        ) : (
          deleteMoves(category.skills, category.prompts)
        )}
      </p>
      {empty ? null : (
        <MoveToField
          exclude={category.name}
          value={moveTo}
          onChange={onMoveToChange}
          locked={busy}
          add={moveToAdd}
        />
      )}
    </Dialog>
  );
}
