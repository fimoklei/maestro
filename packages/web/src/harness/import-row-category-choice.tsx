import {
  CATEGORY_NOT_ADDED,
  setCategoryFor,
} from "../categories/categories-copy";
import { CategoryPicker } from "../categories/category-picker";
import { Notice } from "../ui/notice";
import type { ImportRowCategory } from "./use-import-checklist";

/** A checklist row's category menu, floating from the row's control. */
export function ImportRowCategoryMenu({
  category,
}: {
  category: ImportRowCategory;
}) {
  return (
    <CategoryPicker
      label={setCategoryFor(category.name)}
      current={category.value}
      initialQuery={category.suggested ?? undefined}
      failure={null}
      add={category.add}
      onPick={category.pick}
      onClose={category.closeMenu}
    />
  );
}

/** Under a checklist row: why an add from its menu was refused after a press closed it. */
export function ImportRowCategoryRefusal() {
  return (
    <Notice
      trigger="user-action"
      notice={{ level: "error", ...CATEGORY_NOT_ADDED }}
    />
  );
}
