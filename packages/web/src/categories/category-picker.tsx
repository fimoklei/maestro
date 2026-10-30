import { CategoryMenu, type MenuClosedBy } from "../ui/category-menu";
import type { NoticeContent } from "../ui/notice";
import { CATEGORY_NOT_ADDED } from "./categories-copy";
import { useAddCategory, useCategories } from "./use-categories";

// The category menu over the one categories query: Add adds at once, with no
// confirmation, and picks the name as stored.
export function CategoryPicker({
  label,
  current,
  exclude,
  initialQuery,
  failure = null,
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
  /** Why the caller's last pick did not land. */
  failure?: NoticeContent | null;
  onPick: (name: string | null) => void;
  onClose: (via: MenuClosedBy) => void;
}) {
  const categories = useCategories();
  const add = useAddCategory();
  const names = (categories.data?.categories ?? []).map(({ name }) => name);
  return (
    <CategoryMenu
      label={label}
      names={names}
      current={current}
      exclude={exclude}
      initialQuery={initialQuery}
      failure={
        add.isError ? { level: "error", ...CATEGORY_NOT_ADDED } : failure
      }
      onPick={onPick}
      onAdd={(typed) =>
        add.mutate(typed, { onSuccess: ({ added }) => onPick(added) })
      }
      onClose={onClose}
    />
  );
}
