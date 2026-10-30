// How a refused category read or write is stated: a name refusal is the
// field's own line, the rest a notice in each caller's own words.
import type { CategoryList } from "@maestro/core";
import {
  categoryNameProblem,
  sameCategoryName,
  trimCategoryName,
} from "@maestro/core/category-name";
import { HttpError } from "../api/http";
import type { NoticeContent } from "../ui/notice";
import { requestShapeNotice } from "../ui/notice-table";
import {
  CATEGORY_NAME_ERRORS,
  CATEGORY_NOT_CONFIGURED,
  categoriesUnreadable,
  categoryNotSet,
  nameExistsError,
  type SetCategoryItems,
} from "./categories-copy";

// A string field of the refusal body; anything else reads as absent.
function field(error: unknown, key: string): string | null {
  if (
    !(error instanceof HttpError) ||
    typeof error.body !== "object" ||
    error.body === null ||
    !(key in error.body)
  ) {
    return null;
  }
  const value: unknown = Reflect.get(error.body, key);
  return typeof value === "string" ? value : null;
}

/**
 * The notice for a refused category read or write. The refusals every route
 * shares are stated here; `fallback` states the rest, by the refusal's code.
 */
export function categoryNotice(
  error: unknown,
  fallback: (code: string | null) => NoticeContent,
): NoticeContent | null {
  if (!error) return null;
  const shape = requestShapeNotice(error);
  if (shape !== null) return shape;
  const code = field(error, "error");
  if (code === "not-configured") return CATEGORY_NOT_CONFIGURED;
  const configPath = field(error, "configPath");
  if (code === "categories-unreadable" && configPath !== null) {
    return categoriesUnreadable(configPath);
  }
  return fallback(code);
}

/** Why Set category did not land, for the items it was for. */
export const assignFailure = (
  error: unknown,
  items: SetCategoryItems,
): NoticeContent | null =>
  categoryNotice(error, (code) =>
    categoryNotSet(
      code === "category-not-found" || code === "item-not-found"
        ? code
        : "other",
      items,
    ),
  );

/** Why Rename category or Delete category did not land, in its dialog. */
export const categoryEditFailure = (
  error: unknown,
  copy: (code: "category-not-found" | "other") => NoticeContent,
): NoticeContent | null =>
  categoryNotice(error, (code) =>
    copy(code === "category-not-found" ? code : "other"),
  );

/** A write refused for its name, which the field states. */
export const refusedForName = (error: unknown): boolean => {
  const code = field(error, "error");
  return code === "name-exists" || code === "name-invalid";
};

/**
 * The field's own line for a name the rules, the list or the server refuse.
 * The category being renamed may keep its own name in another case.
 */
export function categoryNameError(
  name: string,
  list: CategoryList | undefined,
  refused: unknown,
  renaming: string | null,
): string | undefined {
  const trimmed = trimCategoryName(name);
  const problem = categoryNameProblem(trimmed);
  if (problem !== null) return CATEGORY_NAME_ERRORS[problem];
  const existing = list?.categories.find(
    (each) => each.name !== renaming && sameCategoryName(each.name, trimmed),
  )?.name;
  if (existing !== undefined) return nameExistsError(existing);
  const named = field(refused, "existing");
  if (field(refused, "error") === "name-exists" && named !== null) {
    return nameExistsError(named);
  }
  return undefined;
}
