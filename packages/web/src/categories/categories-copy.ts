import type { HarnessPrimitiveType, ImportMode } from "@maestro/core";
import type { CategoryNameProblem } from "@maestro/core/category-name";
import { harnessHeadings } from "../harness/notice-copy";
import { ADD_CATEGORY, NO_CATEGORY } from "../ui/category-menu-copy";
import { rereadLabel, SET_CATEGORY } from "../ui/control-labels";
import type { NoticeContent, NoticeCopy } from "../ui/notice";
import { machine, named, type Phrase, phrase } from "../ui/phrase";

const CATEGORIES = "Categories";
export const CATEGORIES_SENTENCE =
  "Categories stay on this computer. Only you see them.";
export const NO_CATEGORIES = "No categories yet";
export const NO_CATEGORIES_SENTENCE = "Categories appear here.";

export { ADD_CATEGORY };
export const ADD_A_CATEGORY = "Add a category";
export const CATEGORY_NAME_LABEL = "Name";

export const REREAD_CATEGORIES = rereadLabel(CATEGORIES);

/** A row with nothing in its category. */
export const NO_ITEMS = "No skills or prompts";

/** A count of one type, as a row's link shows it. */
export const countWords = (count: number, type: HarnessPrimitiveType) =>
  `${count} ${count === 1 ? ITEM_WORDS[type].one : ITEM_WORDS[type].many}`;

/** A count link's accessible name: where it leads. */
export const countInCategory = (
  count: number,
  type: HarnessPrimitiveType,
  categoryName: string,
) => `${countWords(count, type)} in ${categoryName}`;

export const CATEGORY_NAME_ERRORS: Record<CategoryNameProblem, string> = {
  empty: "Enter a name.",
  "too-long": "Enter at most 64 characters.",
  "control-character": "Enter the name on one line.",
  reserved: `Enter a name other than ${NO_CATEGORY}.`,
};

export const nameExistsError = (existing: string): string =>
  `${existing} already exists.`;

const CATEGORIES_NOT_READ = "Categories not read";

/** The broken section the operator repairs by hand; the cockpit offers no reset. */
export const categoriesUnreadable = (configPath: string) =>
  ({
    level: "error",
    label: CATEGORIES_NOT_READ,
    message: phrase`Repair the categories in ${machine(configPath)} manually. Then select ${REREAD_CATEGORIES} to try again.`,
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

/** The detail pane's fact. */
export const CATEGORY_FACT = "Category";

/** The category menu's name: what it sets the category of. */
export const setCategoryFor = (subject: string) =>
  `Set category for ${subject}`;

/** Items of one type, counted. */
export const ITEM_WORDS: Record<
  HarnessPrimitiveType,
  { one: string; many: string }
> = {
  skill: { one: "skill", many: "skills" },
  prompt: { one: "prompt", many: "prompts" },
};

/** The Category field of Import skill, Import prompt and Edit prompt. */
export const CATEGORY_FIELD = {
  label: "Category",
  hint: "Only you see this category.",
} as const;

const CATEGORY_NOT_SET = "Category not set";

/** The edit landed in the Harness; the category after it did not. */
export const CATEGORY_NOT_SET_AFTER_EDIT: NoticeContent = {
  level: "error",
  label: CATEGORY_NOT_SET,
  message: `The prompt was edited. Select Close, then select ${SET_CATEGORY} on Prompts.`,
};

/** Why Set category did not land, stated in the menu; `reread` is the screen's control. */
export const categoryNotSet = (
  code: "category-not-found" | "item-not-found" | "other",
  reread: string,
): NoticeContent => ({
  level: "error",
  label: CATEGORY_NOT_SET,
  message:
    code === "category-not-found"
      ? "The category no longer exists. Choose another category."
      : code === "item-not-found"
        ? `The Harness no longer holds it. Select ${reread} to update the list.`
        : "Choose the category again.",
});

/** The hint once the field holds the category the imported file names. */
export const TAKEN_FROM_FILE: Record<HarnessPrimitiveType, string> = {
  skill: "Taken from SKILL.md.",
  prompt: "Taken from the front matter.",
};

const SCREEN_OF: Record<HarnessPrimitiveType, string> = {
  skill: "Skills",
  prompt: "Prompts",
};

/** The import landed; the category chosen for it did not. */
export const categoryNotSetAfterImport = (
  type: HarnessPrimitiveType,
  name: string,
  mode: ImportMode,
): NoticeContent => ({
  level: "error",
  label: CATEGORY_NOT_SET,
  message: phrase`${named(name)} was ${mode === "update" ? "updated" : "imported"}. Select ${SET_CATEGORY} on ${SCREEN_OF[type]} to set its category.`,
});

export const RENAME_CATEGORY = "Rename category";
export const DELETE_CATEGORY = "Delete category";
export const renameCategoryTitle = (name: string) => `Rename ${name}`;
export const deleteCategoryTitle = (name: string) => `Delete ${name}`;
/** Why Rename category waits: the name is as it was. */
export const CHANGE_THE_NAME = "Change the name.";
export const MOVE_TO = "Move to";

const counted = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

// `3 skills and 2 prompts`, `1 skill`: what a category carries, at least one.
function carried(skills: number, prompts: number): string {
  const parts = [
    skills > 0 ? counted(skills, "skill", "skills") : null,
    prompts > 0 ? counted(prompts, "prompt", "prompts") : null,
  ].filter((part) => part !== null);
  return parts.join(" and ");
}

const one = (skills: number, prompts: number) => skills + prompts === 1;

/** Rename category's field hint; an empty category has none. */
export function renameHint(
  skills: number,
  prompts: number,
): string | undefined {
  if (skills + prompts === 0) return undefined;
  const verb = one(skills, prompts) ? "shows" : "show";
  return `Its ${carried(skills, prompts)} ${verb} the new name.`;
}

/** Delete category's body for a category that carries items. */
export function deleteMoves(skills: number, prompts: number): string {
  return one(skills, prompts)
    ? `Its ${carried(skills, prompts)} moves to the category you choose. It stays in the Harness.`
    : `Its ${carried(skills, prompts)} move to the category you choose. They stay in the Harness.`;
}

/** Delete category's body for an empty category. */
export const emptyCategoryDeleted = (name: string): Phrase =>
  phrase`No skills or prompts are in ${named(name)}.`;

const GONE = `The category no longer exists. Select ${REREAD_CATEGORIES} to update the list.`;

/** Why Rename category did not land, stated in its dialog. */
export const notRenamed = (
  code: "category-not-found" | "other",
): NoticeContent => ({
  level: "error",
  label: "Category not renamed",
  message:
    code === "category-not-found"
      ? GONE
      : `Select ${RENAME_CATEGORY} to try again.`,
});

/** Why Delete category did not land, stated in its dialog. */
export const notDeleted = (
  code: "category-not-found" | "other",
): NoticeContent => ({
  level: "error",
  label: "Category not deleted",
  message:
    code === "category-not-found"
      ? GONE
      : `Select ${DELETE_CATEGORY} to try again.`,
});
