import type { CategoryList } from "@maestro/core";
import { useState } from "react";
import { notDeleted } from "../categories/categories-copy";
import { categoryEditFailure } from "../categories/category-refusals";
import {
  type CategoryDeletion,
  useDeleteCategory,
} from "../categories/use-categories";
import {
  useHeldCategoryAdd,
  useSubmitAfterAdd,
} from "../categories/use-held-category-add";
import { named, phrase } from "../ui/phrase";
import { useWriteAction } from "../ui/use-write-action";
import { DeleteCategoryDialog } from "./delete-category-dialog";

type Category = CategoryList["categories"][number];

// Delete category, mounted only while its dialog stands. A delete takes the
// row away, so a toast says it.
export function DeleteCategoryAction({
  category,
  report,
  onClose,
}: {
  category: Category;
  /** The page's one status region. */
  report: (write: string) => void;
  onClose: () => void;
}) {
  const deleteMutation = useDeleteCategory();
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const remove = useWriteAction(deleteMutation, {
    report,
    show: "toast",
    action: "delete",
    subject: (_list, deletion: CategoryDeletion) => ({
      name: phrase`${named(deletion.name)}`,
      row: null,
    }),
    failure: (error) => categoryEditFailure(error, notDeleted),
  });
  const moveToAdd = useHeldCategoryAdd(setMoveTo);
  const runDelete = useSubmitAfterAdd(moveToAdd, () => {
    remove.run({ name: category.name, moveTo }, { onSuccess: onClose });
  });

  return (
    <DeleteCategoryDialog
      category={category}
      moveTo={moveTo}
      onMoveToChange={setMoveTo}
      moveToAdd={moveToAdd}
      failure={remove.failure}
      busy={remove.phase === "running" || runDelete.waiting}
      onDelete={runDelete.submit}
      onClose={() => {
        if (remove.phase !== "running" && !runDelete.waiting) onClose();
      }}
    />
  );
}
