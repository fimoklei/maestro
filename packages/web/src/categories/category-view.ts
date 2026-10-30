import type { RowData } from "@tanstack/react-table";
import { NO_CATEGORY } from "../ui/category-menu-copy";
import type { ViewOptionsConfig } from "../ui/use-view-options";
import { CATEGORY_FACT } from "./categories-copy";

/** A row's category: null for none, undefined while the list is unread. */
type CategoryOf<T> = (row: T) => string | null | undefined;

// Filter values carry a prefix, so no category name can be the All value.
const filterValue = (name: string) => `category:${name}`;
const NO_CATEGORY_VALUE = "none";

const GROUPING = "category";

/** The optional Category column on Skills and Prompts: off until Display shows it. */
export const CATEGORY_COLUMN = {
  value: "category",
  label: CATEGORY_FACT,
  off: true,
} as const;

// Drops out after Description on a narrow window.
export const CATEGORY_COLUMN_META = {
  className: "text-gray-11",
  width: 40,
  priority: 2,
};

/**
 * Filter's Category section, Display's Category grouping and the default
 * grouping, for a screen whose rows each carry one category or none. Without
 * a read list (`names` undefined) the screen gets neither.
 */
export function categoryView<T extends RowData>({
  names,
  of,
  rows,
  initial,
}: {
  names: readonly string[] | undefined;
  of: CategoryOf<T>;
  rows: readonly T[];
  /** The category a URL names; null for All. */
  initial: string | null;
}): Pick<ViewOptionsConfig<T>, "oneOf" | "groupings" | "defaultGrouping"> {
  if (names === undefined || names.length === 0) {
    return { oneOf: [], groupings: [], defaultGrouping: "none" };
  }
  return {
    oneOf: [
      {
        label: CATEGORY_FACT,
        options: [
          ...names.map((name) => ({ value: filterValue(name), label: name })),
          { value: NO_CATEGORY_VALUE, label: NO_CATEGORY },
        ],
        of: (row) => {
          const category = of(row);
          return category == null ? NO_CATEGORY_VALUE : filterValue(category);
        },
        // A name the list does not hold reads as All.
        initial: initial === null ? "all" : filterValue(initial),
      },
    ],
    groupings: [
      {
        value: GROUPING,
        label: CATEGORY_FACT,
        groups: {
          key: (row) => of(row) ?? NO_CATEGORY,
          order: [...names, NO_CATEGORY],
        },
      },
    ],
    // Never one No category group: grouped only once a row has a category.
    defaultGrouping: rows.some((row) => of(row) != null) ? GROUPING : "none",
  };
}
