import type { CategoryList } from "@maestro/core";
import { type ReactNode, useState } from "react";
import {
  DELETE_CATEGORY,
  notDeleted,
  notRenamed,
  RENAME_CATEGORY,
} from "../categories/categories-copy";
import {
  type CategoryDeletion,
  useDeleteCategory,
  useRenameCategory,
} from "../categories/use-categories";
import type { NoticeContent } from "../ui/notice";
import { requestShapeNotice } from "../ui/notice-table";
import { named, phrase } from "../ui/phrase";
import type { RowMenuItem } from "../ui/row-menu";
import { useWriteAction } from "../ui/use-write-action";
import {
  categoryNameError,
  noticeFor,
  refusalOf,
  refusedForName,
} from "./category-refusals";
import { DeleteCategoryDialog } from "./delete-category-dialog";
import { RenameCategoryDialog } from "./rename-category-dialog";

type Category = CategoryList["categories"][number];

// A refusal the dialog states above its footer; a name refusal is the field's.
function failureOf(
  error: unknown,
  copy: (code: "category-not-found" | "other") => NoticeContent,
): NoticeContent | null {
  if (!error) return null;
  const shape = requestShapeNotice(error);
  if (shape !== null) return shape;
  return noticeFor(
    error,
    copy(
      refusalOf(error)?.error === "category-not-found"
        ? "category-not-found"
        : "other",
    ),
  );
}

/**
 * Rename category and Delete category from a row's ⋮ (#1721): the items and
 * the open dialog. A rename stays in view, so its row says it; a delete takes
 * the row away, so a toast does.
 */
export function useCategoryEdits({
  list,
  report,
  onRenamed,
}: {
  list: CategoryList | undefined;
  /** The page's one status region. */
  report: (write: string) => void;
  /** Selects the renamed row under its new name. */
  onRenamed: (name: string) => void;
}): {
  items: (category: Category) => RowMenuItem[];
  dialog: ReactNode;
} {
  const renameMutation = useRenameCategory();
  const deleteMutation = useDeleteCategory();
  const [renaming, setRenaming] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [moveTo, setMoveTo] = useState<string | null>(null);

  const rename = useWriteAction(renameMutation, {
    report,
    show: "region",
    action: "rename",
    subject: (_list, { to }) => ({
      name: phrase`${named(to.trim())}`,
      row: to.trim(),
    }),
    failure: (error) =>
      refusedForName(error) ? null : failureOf(error, notRenamed),
  });
  const remove = useWriteAction(deleteMutation, {
    report,
    show: "toast",
    action: "delete",
    subject: (_list, deletion: CategoryDeletion) => ({
      name: phrase`${named(deletion.name)}`,
      row: null,
    }),
    failure: (error) => failureOf(error, notDeleted),
  });

  const runRename = () => {
    if (renaming === null) return;
    setSubmitted(true);
    renameMutation.reset();
    if (categoryNameError(name, list, null, renaming.name) !== undefined) {
      return;
    }
    rename.run(
      { from: renaming.name, to: name },
      {
        onSuccess: (_list, { to }) => {
          setRenaming(null);
          onRenamed(to.trim());
        },
      },
    );
  };

  const runDelete = () => {
    if (deleting === null) return;
    remove.run(
      { name: deleting.name, moveTo },
      { onSuccess: () => setDeleting(null) },
    );
  };

  const items = (category: Category): RowMenuItem[] => [
    {
      label: RENAME_CATEGORY,
      movesFocus: true,
      onSelect: () => {
        setName(category.name);
        setSubmitted(false);
        renameMutation.reset();
        setRenaming(category);
      },
    },
    {
      label: DELETE_CATEGORY,
      danger: true,
      movesFocus: true,
      onSelect: () => {
        setMoveTo(null);
        deleteMutation.reset();
        setDeleting(category);
      },
    },
  ];

  const dialog =
    renaming !== null ? (
      <RenameCategoryDialog
        category={renaming}
        name={name}
        onNameChange={(next) => {
          setName(next);
          renameMutation.reset();
        }}
        error={
          submitted
            ? categoryNameError(name, list, renameMutation.error, renaming.name)
            : undefined
        }
        failure={rename.failure}
        busy={rename.phase === "running"}
        onRename={runRename}
        onClose={() => {
          if (rename.phase !== "running") setRenaming(null);
        }}
      />
    ) : deleting !== null ? (
      <DeleteCategoryDialog
        category={deleting}
        moveTo={moveTo}
        onMoveToChange={setMoveTo}
        failure={remove.failure}
        busy={remove.phase === "running"}
        onDelete={runDelete}
        onClose={() => {
          if (remove.phase !== "running") setDeleting(null);
        }}
      />
    ) : null;

  return { items, dialog };
}
