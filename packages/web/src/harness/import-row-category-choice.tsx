import {
  CATEGORY_NOT_ADDED,
  setCategoryFor,
} from "../categories/categories-copy";
import { CategoryPicker } from "../categories/category-picker";
import { Notice } from "../ui/notice";
import type { ImportRowCategory } from "./use-import-checklist";

/**
 * Under a checklist row: its open category menu, or why an add from that menu
 * was refused after a press closed it. In the flow, as the list clips what
 * floats out of it.
 */
export function ImportRowCategoryChoice({
  category,
}: {
  category: ImportRowCategory;
}) {
  if (category.open) {
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
  return category.addFailed ? (
    <Notice
      trigger="user-action"
      notice={{ level: "error", ...CATEGORY_NOT_ADDED }}
    />
  ) : null;
}
