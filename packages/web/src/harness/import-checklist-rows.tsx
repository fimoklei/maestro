import type { ReactNode } from "react";
import { RowCategoryControl } from "../categories/row-category-control";
import type { GroupedListGroup } from "../ui/grouped-list";
import { importChecklistGroups } from "./import-checklist-groups";
import { ImportRowCategoryChoice } from "./import-row-category-choice";
import type { ImportChecklist } from "./use-import-checklist";

/**
 * The checklist's groups as a dialog lists them, each row that takes a
 * Category with its control, and its menu or refused add under it.
 */
export function importChecklistRows<Refusal>(
  { rows, rowCategory }: Pick<ImportChecklist<Refusal>, "rows" | "rowCategory">,
  refusalSentence: (refusal: Refusal) => ReactNode,
  isRunning: boolean,
): GroupedListGroup[] {
  return importChecklistGroups(rows ?? [], refusalSentence, (row) => {
    const category = rowCategory(row);
    if (category === null) return {};
    return {
      control: (
        <RowCategoryControl
          name={category.name}
          value={category.value}
          open={category.open}
          disabled={isRunning}
          buttonRef={category.buttonRef}
          onToggle={category.toggleMenu}
        />
      ),
      ...(category.open || category.addFailed
        ? { choice: <ImportRowCategoryChoice category={category} /> }
        : {}),
    };
  });
}
