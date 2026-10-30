// How Settings › Categories states a refused read or write: a name refusal is
// the field's own line, the rest a notice.
import type { CategoryList } from "@maestro/core";
import {
  categoryNameProblem,
  sameCategoryName,
  trimCategoryName,
} from "@maestro/core/category-name";
import { HttpError } from "../api/http";
import {
  CATEGORY_NAME_ERRORS,
  CATEGORY_NOT_CONFIGURED,
  categoriesUnreadable,
  nameExistsError,
} from "../categories/categories-copy";
import type { NoticeContent } from "../ui/notice";

type Refusal = { error?: string; existing?: string; configPath?: string };

export const refusalOf = (error: unknown): Refusal | null =>
  error instanceof HttpError && typeof error.body === "object"
    ? (error.body as Refusal | null)
    : null;

/** A refusal the page or a dialog states as a notice. */
export function noticeFor(
  error: unknown,
  fallback: NoticeContent,
): NoticeContent | null {
  if (!error) return null;
  const refusal = refusalOf(error);
  if (refusal?.error === "not-configured") {
    return CATEGORY_NOT_CONFIGURED;
  }
  if (
    refusal?.error === "categories-unreadable" &&
    typeof refusal.configPath === "string"
  ) {
    return categoriesUnreadable(refusal.configPath);
  }
  return fallback;
}

/** A write refused for its name, which the field states. */
export const refusedForName = (error: unknown): boolean => {
  const code = refusalOf(error)?.error;
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
  const refusal = refusalOf(refused);
  if (refusal?.error === "name-exists" && refusal.existing !== undefined) {
    return nameExistsError(refusal.existing);
  }
  return undefined;
}
