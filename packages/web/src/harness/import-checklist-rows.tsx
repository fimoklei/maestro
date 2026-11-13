import type { ReactNode } from "react";
import { RowCategoryControl } from "../categories/row-category-control";
import { AnchoredFloat } from "../ui/anchored-float";
import type { GroupedListGroup } from "../ui/grouped-list";
import { importChecklistGroups } from "./import-checklist-groups";
import {
  ImportRowCategoryMenu,
  ImportRowCategoryRefusal,
} from "./import-row-category-choice";
import type { ImportChecklist } from "./use-import-checklist";

/**
 * The checklist's groups as a dialog lists them, each row that takes a
 * Category with its control and the menu floating from it, and a refused
 * add under the row.
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
        <AnchoredFloat
          open={category.open}
          width="menu"
          anchor={
            <RowCategoryControl
              name={category.name}
              value={category.value}
              open={category.open}
              disabled={isRunning}
              onToggle={category.toggleMenu}
            />
          }
        >
          <ImportRowCategoryMenu category={category} />
        </AnchoredFloat>
      ),
      ...(!category.open && category.addFailed
        ? { choice: <ImportRowCategoryRefusal /> }
        : {}),
    };
  });
}
