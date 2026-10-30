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
  const write = useWriteAction<
    unknown,
    CategoryAssignment,
    NoticeContent | null
  >(assign, {
    screen: useScreenWrites(),
    action: "setCategory",
    subject: (_data, { items: set }) => {
      const [only] = set;
      if (set.length === 1 && only !== undefined) {
        return { name: only.name, row: only.name };
      }
      const words = ITEM_WORDS[only?.type ?? "skill"];
      return { name: { count: set.length, ...words }, row: null };
    },
    failure: (error) =>
      assignFailure(error, {
        type: items[0]?.type ?? "skill",
        count: items.length,
        reread,
      }),
  });
  const pick = (category: string | null) =>
    write.run(
      { items: [...items], category },
      { onSuccess: () => onClose("picked") },
    );
  // Picked from the menu only: a press outside it cancels the assign.
  const add = useHeldCategoryAdd(() => {});
  const [only] = items;
  const words = ITEM_WORDS[only?.type ?? "skill"];
  const subject =
    items.length === 1 && only !== undefined
      ? only.name
      : `${items.length} ${words.many}`;
  return (
    <CategoryPicker
      label={setCategoryFor(subject)}
      current={sharedCategory(categories.data?.assignments ?? [], items)}
      failure={write.failure}
      add={add}
      onPick={pick}
      onClose={onClose}
    />
  );
}
