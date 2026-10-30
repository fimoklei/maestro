import type { CategoryError } from "@maestro/core";
import type { CategoryNameProblem } from "@maestro/core/category-name";
import { harnessHeadings } from "../harness/notice-copy";
import { rereadLabel } from "../ui/control-labels";
import type { NoticeCopy } from "../ui/notice";
import { machine, type Phrase, phrase } from "../ui/phrase";

export const CATEGORIES = "Categories";
export const CATEGORIES_SENTENCE =
  "Categories stay on this computer. Only you see them.";
export const NO_CATEGORIES = "No categories yet";
export const NO_CATEGORIES_SENTENCE = "Categories appear here.";

export const ADD_CATEGORY = "Add category";
export const ADD_A_CATEGORY = "Add a category";
export const CATEGORY_NAME_LABEL = "Name";

export const REREAD_CATEGORIES = rereadLabel(CATEGORIES);

/** A row's counts, written whole for each case. */
export function categoryCounts(skills: number, prompts: number): string {
  const skillWords = `${skills} ${skills === 1 ? "skill" : "skills"}`;
  const promptWords = `${prompts} ${prompts === 1 ? "prompt" : "prompts"}`;
  if (skills === 0 && prompts === 0) return "No skills or prompts";
  if (prompts === 0) return skillWords;
  if (skills === 0) return promptWords;
  return `${skillWords} · ${promptWords}`;
}

export const CATEGORY_NAME_ERRORS: Record<CategoryNameProblem, string> = {
  empty: "Enter a name.",
  "too-long": "Enter at most 64 characters.",
  "control-character": "Enter the name on one line.",
};

export const nameExistsError = (existing: string): string =>
  `${existing} already exists.`;

const CATEGORIES_NOT_READ = "Categories not read";

/** The broken section the operator repairs by hand; the cockpit offers no reset. */
export const categoriesUnreadable = (configPath: string) =>
  ({
    level: "error",
    label: CATEGORIES_NOT_READ,
    message: phrase`Repair the categories in ${machine(configPath)} by hand.`,
  }) as const satisfies NoticeCopy & { message: Phrase; level: "error" };

export const CATEGORIES_READ_FAILED: NoticeCopy = {
  label: CATEGORIES_NOT_READ,
  message: `Select ${REREAD_CATEGORIES} to try again.`,
};

export const CATEGORY_NOT_ADDED: NoticeCopy = {
  label: "Category not added",
  message: `Select ${ADD_CATEGORY} to try again.`,
};

/** The refusals a notice states; a name refusal is the field's own line. */
export const CATEGORY_NOT_CONFIGURED = harnessHeadings["not-configured"];

export type CategoryNoticeCode = Extract<
  CategoryError,
  "not-configured" | "categories-unreadable"
>;
