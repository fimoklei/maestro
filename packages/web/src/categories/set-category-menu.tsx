import type { PrimitiveRef } from "@maestro/core";
import type { MenuClosedBy } from "../ui/category-menu";
import type { NoticeContent } from "../ui/notice";
import { useScreenWrites, useWriteAction } from "../ui/use-write-action";
import { ITEM_WORDS, setCategoryFor } from "./categories-copy";
import { CategoryPicker } from "./category-picker";
import { assignFailure } from "./category-refusals";
import {
  type CategoryAssignment,
  sharedCategory,
  useAssignCategory,
  useCategories,
} from "./use-categories";
import { useHeldCategoryAdd } from "./use-held-category-add";

/**
 * Set category for items of one type, inside a table screen: one item's row
 * says it in the status region, several in a toast by count.
 */
export function SetCategoryMenu({
  items,
  reread,
  onClose,
}: {
  /** One type, at least one item; each item's name is its row id. */
  items: readonly PrimitiveRef[];
  /** The screen's own Re-read control, which a refusal names. */
  reread: string;
  /** Called on Escape and once the category is set. */
  onClose: (via: MenuClosedBy) => void;
}) {
  const categories = useCategories();
  const assign = useAssignCategory();
  // One item is named, several counted: in the menu's name and the done sentence.
  const [first] = items;
  const type = first?.type ?? "skill";
  const words = ITEM_WORDS[type];
  const only = items.length === 1 && first !== undefined ? first.name : null;
  const write = useWriteAction<
    unknown,
    CategoryAssignment,
    NoticeContent | null
  >(assign, {
    screen: useScreenWrites(),
    action: "setCategory",
    subject: () =>
      only === null
        ? { name: { count: items.length, ...words }, row: null }
        : { name: only, row: only },
    failure: (error) =>
      assignFailure(error, { type, count: items.length, reread }),
  });
  const pick = (category: string | null) =>
    write.run(
      { items: [...items], category },
      { onSuccess: () => onClose("picked") },
    );
  // Picked from the menu only: a press outside it cancels the assign.
  const add = useHeldCategoryAdd(() => {});
  return (
    <CategoryPicker
      label={setCategoryFor(only ?? `${items.length} ${words.many}`)}
      current={sharedCategory(categories.data?.assignments ?? [], items)}
      failure={write.failure}
      add={add}
      onPick={pick}
      onClose={onClose}
    />
  );
}
