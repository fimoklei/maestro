import { useEffect, useRef } from "react";
import { CategoryMenu, type MenuClosedBy } from "../ui/category-menu";
import type { NoticeContent } from "../ui/notice";
import { CATEGORY_NOT_ADDED } from "./categories-copy";
import { useCategories } from "./use-categories";
import type { HeldCategoryAdd } from "./use-held-category-add";

// The category menu over the one categories query: Add adds at once, with no
// confirmation, through the caller's add, which takes the name as stored.
export function CategoryPicker({
  label,
  current,
  exclude,
  initialQuery,
  failure,
  add,
  onPick,
  onClose,
}: {
  label: string;
  /** Marked ✓: null for No category; undefined marks nothing. */
  current: string | null | undefined;
  /** A category the reader may not pick, such as the one being deleted. */
  exclude?: string;
  /** What the search box opens holding. */
  initialQuery?: string;
  /** Why the caller's last pick did not land; null when it did. */
  failure: NoticeContent | null;
  add: HeldCategoryAdd;
  onPick: (name: string | null) => void;
  onClose: (via: MenuClosedBy) => void;
}) {
  const categories = useCategories();
  const names = (categories.data?.categories ?? []).map(({ name }) => name);
  // An add that lands while the menu shows is picked; one that lands after a
  // press closed the menu reaches the form through the add alone.
  const shown = useRef(true);
  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);
  return (
    <CategoryMenu
      label={label}
      names={names}
      current={current}
      exclude={exclude}
      initialQuery={initialQuery}
      failure={add.failed ? { level: "error", ...CATEGORY_NOT_ADDED } : failure}
      onPick={onPick}
      onAdd={(typed) => {
        void add.run(typed).then((added) => {
          if (added !== null && shown.current) onPick(added);
        });
      }}
      onClose={onClose}
    />
  );
}
