import type { CategoryList } from "@maestro/core";
import { type ReactNode, useState } from "react";
import {
  DELETE_CATEGORY,
  RENAME_CATEGORY,
} from "../categories/categories-copy";
import type { RowMenuItem } from "../ui/row-menu";
import { DeleteCategoryAction } from "./delete-category-action";
import { RenameCategoryAction } from "./rename-category-action";

type Category = CategoryList["categories"][number];

/** The one edit a row's ⋮ opened, on the category it was opened from. */
type Editing = { kind: "rename" | "delete"; category: Category };

/**
 * Rename category and Delete category from a row's ⋮ (#1721): the items and
 * the open dialog. Each dialog lives only while it stands, so closing forgets
 * its fields.
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
  const [editing, setEditing] = useState<Editing | null>(null);
  const close = () => setEditing(null);

  const items = (category: Category): RowMenuItem[] => [
    {
      label: RENAME_CATEGORY,
      movesFocus: true,
      onSelect: () => setEditing({ kind: "rename", category }),
    },
    {
      label: DELETE_CATEGORY,
      danger: true,
      movesFocus: true,
      onSelect: () => setEditing({ kind: "delete", category }),
    },
  ];

  const dialog =
    editing === null ? null : editing.kind === "rename" ? (
      <RenameCategoryAction
        key={editing.category.name}
        category={editing.category}
        list={list}
        report={report}
        onRenamed={onRenamed}
        onClose={close}
      />
    ) : (
      <DeleteCategoryAction
        key={editing.category.name}
        category={editing.category}
        report={report}
        onClose={close}
      />
    );

  return { items, dialog };
}
