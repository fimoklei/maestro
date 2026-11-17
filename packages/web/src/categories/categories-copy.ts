import type {
  CopyFacts,
  CopyMode,
  HarnessPrimitiveType,
  ImportMode,
} from "@maestro/core";
import type { CategoryNameProblem } from "@maestro/core/category-name";
import { harnessHeadings } from "../harness/notice-copy";
import { loadingText } from "../ui/busy-copy";
import { ADD_CATEGORY, NO_CATEGORY } from "../ui/category-menu-copy";
import { rereadLabel, SET_CATEGORY } from "../ui/control-labels";
import { CLOSE } from "../ui/dialog-copy";
import type { NoticeContent, NoticeCopy } from "../ui/notice";
import { machine, named, namedList, type Phrase, phrase } from "../ui/phrase";

const CATEGORIES = "Categories";
export const CATEGORIES_SENTENCE =
  "Your categories are saved on this computer.";
export const NO_CATEGORIES = "No categories yet";
export const NO_CATEGORIES_SENTENCE = "Categories appear here.";
/** The empty list's sentence while the Harness carries categories to copy. */
export const NO_CATEGORIES_OR_COPY =
  "Add a category or copy categories from the Harness.";

/** The section of the categories the latest Harness release contains. */
export const HARNESS_CATEGORIES = "Harness categories";

/** Stated only for a release with categories (#1904). */
export const harnessCategoriesCount = (count: number) =>
  `The latest Harness release contains ${count} ${count === 1 ? "category" : "categories"}.`;

/** A file with an error never reads as no categories; the own list works on. */
export const harnessCategoriesFaulty = (tag: string) =>
  ({
    level: "warning",
    label: "Couldn't load Harness categories",
    message: phrase`The categories file in Harness release ${machine(tag)} contains an error. You can still propose your own categories for review.`,
  }) as const satisfies NoticeContent;

/** The dot's accessible text, and the notice's heading on Categories in Settings. */
export const HARNESS_CATEGORIES_CHANGED = "Harness categories have changed";

/** A release changed the Harness categories since the operator last saw them; the Copy row below acts on it. */
export const harnessCategoriesChanged = (tag: string) =>
  ({
    level: "info",
    label: HARNESS_CATEGORIES_CHANGED,
    message: phrase`Release ${machine(tag)} changed the Harness categories. Select ${COPY} to compare them with your list before anything changes.`,
  }) as const satisfies NoticeContent;

/** The copy dialog's row fact for a category absent from the list the operator last saw. */
export const newIn = (tag: string): Phrase => phrase`New in ${machine(tag)}`;

/** The row, its button's accessible name and the copy dialog's title. */
export const COPY_HARNESS_CATEGORIES = "Copy Harness categories";
/** The row's button, short as asked; its accessible name says what it copies. */
export const COPY = "Copy";
export const COPY_ROW_SENTENCE =
  "Copies the Harness categories into your list. Your list stays as it is when the Harness changes.";
export const COPY_CATEGORIES = "Copy categories";

export const copyIntro = (tag: string, count: number): Phrase =>
  phrase`Harness release ${machine(tag)} has ${count} ${count === 1 ? "category" : "categories"}. After the copy, your categories stay as they are when the Harness changes.`;

export const copySkipped = (count: number) =>
  count === 1
    ? "The categories file has 1 entry with an error. It won't be copied."
    : `The categories file has ${count} entries with errors. They won't be copied.`;

export const HOW_TO_COPY = "How to copy";

export const COPY_MODE_COPY: Record<
  CopyMode,
  { label: string; description: string }
> = {
  add: {
    label: "Add",
    description:
      "Adds the categories you don't have and gives each skill or prompt without a category its Harness category.",
  },
  replace: {
    label: "Replace",
    description:
      "Deletes the categories only you have. Every skill and prompt gets its Harness category, or none.",
  },
};

export const WHAT_HAPPENS = "What happens to your categories";

type CopyGroup = "added" | "deleted" | "unchanged";

const COPY_GROUPS: Record<CopyGroup, string> = {
  added: "Added",
  deleted: "Deleted",
  unchanged: "Unchanged",
};

export const copyGroupLegend = (group: CopyGroup, count: number) =>
  `${COPY_GROUPS[group]} · ${count}`;

/** The row fact on a name Replace spells as the Harness does. */
export const spelledInYourList = (was: string): Phrase =>
  phrase`Spelled ${named(was)} in your list`;

// `A`, `A and B`, `A, B and C`, from four names `A, B and 2 more`.
const deletedNames = (names: readonly string[]): Phrase =>
  names.length <= 3
    ? namedList(names)
    : phrase`${named(names[0] ?? "")}, ${named(names[1] ?? "")} and ${names.length - 2} more`;

/** What Replace takes from the operator's sorting; null when it takes nothing. */
export function replaceWarning({
  deleted,
  moved,
  uncategorised,
}: CopyFacts): NoticeContent | null {
  const movedCount = moved.skills + moved.prompts;
  const clearedCount = uncategorised.skills + uncategorised.prompts;
  const items = movedCount + clearedCount;
  if (deleted.length === 0 && items === 0) return null;
  const willMove = `${carried(moved.skills, moved.prompts)} will move to another category`;
  const willClear = `${carried(uncategorised.skills, uncategorised.prompts)} will have no category`;
  const sentences: Phrase[] = [
    ...(deleted.length === 0
      ? []
      : [
          phrase`${deletedNames(deleted)} ${deleted.length === 1 ? "isn't" : "aren't"} in the Harness categories.`,
        ]),
    ...(deleted.length > 0 && items === 0
      ? [
          deleted.length === 1
            ? emptyCategoryDeleted(deleted[0] ?? "")
            : phrase`No skills or prompts are in these categories.`,
        ]
      : []),
    ...(items === 0
      ? []
      : [
          phrase`${
            movedCount === 0
              ? willClear
              : clearedCount === 0
                ? willMove
                : `${willMove}, and ${willClear}`
          }.`,
          phrase`${items === 1 ? "It stays" : "They stay"} in the Harness.`,
        ]),
    phrase`You can't undo Replace. Select ${COPY_MODE_COPY.add.label} to keep everything you have.`,
  ];
  return {
    level: "warning",
    label:
      deleted.length === 0
        ? `Replace changes the category of ${carried(
            moved.skills + uncategorised.skills,
            moved.prompts + uncategorised.prompts,
          )}`
        : `Replace deletes ${deleted.length} of your categories`,
    message: {
      parts: sentences.flatMap((sentence, index) =>
        index === 0 ? sentence.parts : [" ", ...sentence.parts],
      ),
    },
  };
}

/** Heard while the copy dialog reads the release. */
export const LOADING_HARNESS_CATEGORIES = loadingText(HARNESS_CATEGORIES);

const NOTHING_LEFT = `The latest Harness release has no categories to copy. Select ${CLOSE}, then select ${rereadLabel(CATEGORIES)}.`;
/** The cause when the latest release could not be read. */
export const RELEASE_UNREAD =
  "Maestro couldn't read the latest Harness release.";

/** Why the copy dialog has nothing to show, by the refusal's code. */
export const copyPreviewFailed = (code: string | null): NoticeContent => ({
  level: "error",
  label: "Couldn't load Harness categories",
  message:
    code === "no-harness-categories"
      ? NOTHING_LEFT
      : code === "harness-categories-unread"
        ? `${RELEASE_UNREAD} Select ${CLOSE}, then select ${COPY} to try again.`
        : `Select ${CLOSE}, then select ${COPY} to try again.`,
});

/** Heading of every failed copy of the Harness categories. */
export const COPY_FAILED_HEADING = "Couldn't copy Harness categories";

/** Why Copy categories did not land, by the refusal's code. */
export const copyFailed = (code: string | null): NoticeContent => ({
  level: "error",
  label: COPY_FAILED_HEADING,
  message:
    code === "no-harness-categories"
      ? NOTHING_LEFT
      : code === "harness-categories-unread"
        ? `${RELEASE_UNREAD} Select ${COPY_CATEGORIES} to try again.`
        : `Select ${COPY_CATEGORIES} to try again.`,
});

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

/** The Category field of Import prompts and Edit prompt. */
export const CATEGORY_FIELD = { label: "Category" } as const;

export const CATEGORY_NOT_SET = "Category not set";

/** The edit landed in the Harness; the category after it did not. */
export const CATEGORY_NOT_SET_AFTER_EDIT: NoticeContent = {
  level: "error",
  label: CATEGORY_NOT_SET,
  message: `The prompt was edited. Select ${CLOSE}, then select ${SET_CATEGORY} on Prompts.`,
};

/** The items a refused Set category was for, and the screen's own Re-read control. */
export type SetCategoryItems = {
  type: HarnessPrimitiveType;
  count: number;
  reread: string;
};

const DELETED = "The category was deleted.";

/** Why Set category did not land, stated where it was set. */
export const categoryNotSet = (
  code: "category-not-found" | "item-not-found" | "other",
  { type, count, reread }: SetCategoryItems,
): NoticeContent => ({
  level: "error",
  label: CATEGORY_NOT_SET,
  message:
    code === "category-not-found"
      ? `${DELETED} Choose another category.`
      : code === "item-not-found"
        ? `The Harness no longer contains ${count === 1 ? "the" : "a"} ${ITEM_WORDS[type].one}. Select ${reread} to update the list.`
        : "Choose the category again.",
});

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
  message: phrase`${named(name)} was ${mode === "update" ? "updated" : "imported"}. Select ${CLOSE}, then select ${SET_CATEGORY} on ${SCREEN_OF[type]}.`,
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

const GONE = `${DELETED} Select ${REREAD_CATEGORIES} to update the list.`;

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
