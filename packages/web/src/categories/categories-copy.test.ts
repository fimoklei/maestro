import type { CopyFacts } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { plainText } from "../ui/phrase";
import {
  CATEGORIES_READ_FAILED,
  CATEGORIES_SENTENCE,
  CATEGORY_FIELD,
  CATEGORY_NAME_ERRORS,
  CATEGORY_NOT_ADDED,
  CATEGORY_NOT_SET_AFTER_EDIT,
  COPY_CATEGORIES,
  COPY_FROM_HARNESS,
  COPY_HARNESS_CATEGORIES,
  COPY_MODE_COPY,
  COPY_ROW_SENTENCE,
  categoriesUnreadable,
  categoryNotSet,
  categoryNotSetAfterImport,
  copyFailed,
  copyGroupLegend,
  copyIntro,
  copyPreviewFailed,
  copySkipped,
  countInCategory,
  countWords,
  deleteMoves,
  emptyCategoryDeleted,
  HARNESS_CATEGORIES,
  harnessCategoriesChanged,
  harnessCategoriesCount,
  harnessCategoriesFaulty,
  LOADING_CATEGORIES,
  NO_CATEGORIES,
  NO_CATEGORIES_OR_COPY,
  NO_CATEGORIES_SENTENCE,
  NO_ITEMS,
  nameExistsError,
  notDeleted,
  notRenamed,
  renameHint,
  replaceWarning,
  setCategoryFor,
  spelledInYourList,
} from "./categories-copy";

// Approved sentences, as exact strings.
describe("Categories copy", () => {
  it("says where categories live, and what the empty list holds", () => {
    expect(CATEGORIES_SENTENCE).toBe(
      "Your categories are saved on this computer.",
    );
    expect(NO_CATEGORIES).toBe("No categories yet");
    expect(NO_CATEGORIES_SENTENCE).toBe("Categories appear here.");
    expect(NO_CATEGORIES_OR_COPY).toBe(
      "Add a category or copy categories from the Harness.",
    );
  });

  it.each([
    [6, "The latest Harness release contains 6 categories."],
    [1, "The latest Harness release contains 1 category."],
  ])("counts %i Harness categories", (count, sentence) => {
    expect(HARNESS_CATEGORIES).toBe("Harness categories");
    expect(harnessCategoriesCount(count)).toBe(sentence);
  });

  it("names the release whose categories file contains an error", () => {
    const notice = harnessCategoriesFaulty("v1.5.0");
    expect(notice.level).toBe("warning");
    expect(notice.label).toBe("Couldn't read Harness categories");
    expect(plainText(notice.message)).toBe(
      "The categories file in Harness release v1.5.0 contains an error. You can still propose your own categories for review.",
    );
  });

  it("names the release that changed the Harness categories", () => {
    expect(plainText(harnessCategoriesChanged("v1.5.0").message)).toBe(
      "Release v1.5.0 changed the Harness categories. Before you copy them, you can compare them with your list.",
    );
  });

  it("offers the copy of the Harness categories in the approved words", () => {
    expect(COPY_HARNESS_CATEGORIES).toBe("Copy Harness categories");
    expect(COPY_FROM_HARNESS).toBe("Copy from Harness");
    expect(COPY_CATEGORIES).toBe("Copy categories");
    expect(COPY_ROW_SENTENCE).toBe(
      "Copies the Harness categories into your list.",
    );
    expect(COPY_MODE_COPY).toEqual({
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
    });
    expect(LOADING_CATEGORIES).toBe("Loading categories…");
  });

  it.each([
    [6, "Harness release v1.5.0 has 6 categories."],
    [1, "Harness release v1.5.0 has 1 category."],
  ])(
    "opens the copy dialog on the %i categories of the release",
    (count, text) => {
      expect(plainText(copyIntro("v1.5.0", count))).toBe(text);
    },
  );

  it.each([
    [1, "The categories file has 1 entry with an error. It won't be copied."],
    [2, "The categories file has 2 entries with errors. They won't be copied."],
  ])("counts %i skipped entries", (count, text) => {
    expect(copySkipped(count)).toBe(text);
  });

  it.each([
    ["added", 2, "Added · 2"],
    ["deleted", 1, "Deleted · 1"],
    ["unchanged", 0, "Unchanged · 0"],
  ] as const)("names the %s group with its count", (group, count, legend) => {
    expect(copyGroupLegend(group, count)).toBe(legend);
  });

  it("states how the operator spelled a name Replace respells", () => {
    expect(plainText(spelledInYourList("code review"))).toBe(
      "Spelled code review in your list",
    );
  });

  const UNDO = "You can't undo Replace. Add keeps everything you have.";
  const taken = (facts: Partial<CopyFacts>): CopyFacts => ({
    added: [],
    deleted: [],
    unchanged: [],
    respelled: [],
    moved: { skills: 0, prompts: 0 },
    uncategorised: { skills: 0, prompts: 0 },
    ...facts,
  });

  it.each<[string, Partial<CopyFacts>, string, string]>([
    [
      "the worked example",
      {
        deleted: ["Drafts"],
        moved: { skills: 2, prompts: 0 },
        uncategorised: { skills: 0, prompts: 1 },
      },
      "Replace deletes 1 of your categories",
      `Drafts isn't in the Harness categories. 2 skills will move to another category, and 1 prompt will have no category. They stay in the Harness. ${UNDO}`,
    ],
    [
      "two empty deleted categories",
      { deleted: ["Drafts", "Research"] },
      "Replace deletes 2 of your categories",
      `Drafts and Research aren't in the Harness categories. No skills or prompts are in these categories. ${UNDO}`,
    ],
    [
      "one empty deleted category",
      { deleted: ["Drafts"] },
      "Replace deletes 1 of your categories",
      `Drafts isn't in the Harness categories. No skills or prompts are in Drafts. ${UNDO}`,
    ],
    [
      "three deleted categories",
      {
        deleted: ["Drafts", "Ideas", "Research"],
        uncategorised: { skills: 0, prompts: 1 },
      },
      "Replace deletes 3 of your categories",
      `Drafts, Ideas and Research aren't in the Harness categories. 1 prompt will have no category. It stays in the Harness. ${UNDO}`,
    ],
    [
      "five deleted categories",
      {
        deleted: ["Drafts", "Ideas", "Notes", "Research", "Tools"],
        uncategorised: { skills: 3, prompts: 2 },
      },
      "Replace deletes 5 of your categories",
      `Drafts, Ideas and 3 more aren't in the Harness categories. 3 skills and 2 prompts will have no category. They stay in the Harness. ${UNDO}`,
    ],
    [
      "moves and clears without a deleted category",
      {
        moved: { skills: 1, prompts: 0 },
        uncategorised: { skills: 0, prompts: 2 },
      },
      "Replace changes the category of 1 skill and 2 prompts",
      `1 skill will move to another category, and 2 prompts will have no category. They stay in the Harness. ${UNDO}`,
    ],
    [
      "one move alone",
      { moved: { skills: 1, prompts: 0 } },
      "Replace changes the category of 1 skill",
      `1 skill will move to another category. It stays in the Harness. ${UNDO}`,
    ],
    [
      "a skill moved and a skill cleared",
      {
        moved: { skills: 1, prompts: 0 },
        uncategorised: { skills: 1, prompts: 0 },
      },
      "Replace changes the category of 2 skills",
      `1 skill will move to another category, and 1 skill will have no category. They stay in the Harness. ${UNDO}`,
    ],
  ])("warns what Replace takes: %s", (_, facts, label, message) => {
    const notice = replaceWarning(taken(facts));
    expect(notice?.level).toBe("warning");
    expect(notice?.label).toBe(label);
    expect(notice === null ? null : plainText(notice.message)).toBe(message);
  });

  it.each<[string, Partial<CopyFacts>]>([
    ["only adds", { added: ["Planning"] }],
    ["the lists are equal", { unchanged: ["Review"] }],
    [
      "only respells",
      {
        unchanged: ["Code Review"],
        respelled: [{ name: "Code Review", was: "code review" }],
      },
    ],
  ])("warns of nothing when Replace %s", (_, facts) => {
    expect(replaceWarning(taken(facts))).toBeNull();
  });

  it.each([
    [
      "no-harness-categories",
      "No Harness categories to copy",
      "The latest Harness release has no categories to copy. Select Close, then select Re-read Categories.",
    ],
    [
      "harness-categories-unread",
      "Couldn't read Harness categories",
      "Maestro couldn't read the latest Harness release. Select Close, then select Copy from Harness to try again.",
    ],
    [
      null,
      "Couldn't read Harness categories",
      "Select Close, then select Copy from Harness to try again.",
    ],
  ])(
    "states a copy dialog with nothing to show: %s",
    (code, label, message) => {
      expect(copyPreviewFailed(code)).toEqual({
        level: "error",
        label,
        message,
      });
    },
  );

  it.each([
    [
      "no-harness-categories",
      "The latest Harness release has no categories to copy. Select Close, then select Re-read Categories.",
    ],
    [
      "harness-categories-unread",
      "Maestro couldn't read the latest Harness release. Select Copy categories to try again.",
    ],
    [null, "Select Copy categories to try again."],
  ])("states why Copy categories didn't land: %s", (code, message) => {
    expect(copyFailed(code)).toEqual({
      level: "error",
      label: "Couldn't copy Harness categories",
      message,
    });
  });

  it.each([
    [1, "skill", "1 skill"],
    [3, "skill", "3 skills"],
    [1, "prompt", "1 prompt"],
    [2, "prompt", "2 prompts"],
  ] as const)("counts %i %s as %s", (count, type, words) => {
    expect(countWords(count, type)).toBe(words);
  });

  it("names an empty row, and where each count link leads", () => {
    expect(NO_ITEMS).toBe("No skills or prompts");
    expect(countInCategory(3, "skill", "Planning")).toBe(
      "3 skills in Planning",
    );
    expect(countInCategory(1, "prompt", "Planning")).toBe(
      "1 prompt in Planning",
    );
  });

  it("states each name refusal as one field line", () => {
    expect(CATEGORY_NAME_ERRORS).toEqual({
      empty: "Enter a name.",
      "too-long": "Enter at most 64 characters.",
      "control-character": "Enter the name on one line.",
      reserved: "Enter a name other than No category.",
    });
    expect(nameExistsError("Code review")).toBe("Code review already exists.");
  });

  it("names the config file to repair by hand, then the control that reads it again", () => {
    const notice = categoriesUnreadable("/Users/me/.maestro/config.json");
    expect(notice.label).toBe("Couldn't read your categories");
    expect(plainText(notice.message)).toBe(
      "Repair the categories in /Users/me/.maestro/config.json manually. Then select Re-read Categories to try again.",
    );
  });

  it("names the control that recovers a failed read or add", () => {
    expect(CATEGORIES_READ_FAILED).toEqual({
      label: "Couldn't read your categories",
      message: "Select Re-read Categories to try again.",
    });
    expect(CATEGORY_NOT_ADDED).toEqual({
      label: "Category not added",
      message: "Select Add category to try again.",
    });
  });

  it("names the category menu by what it sets", () => {
    expect(setCategoryFor("tdd")).toBe("Set category for tdd");
    expect(setCategoryFor("3 skills")).toBe("Set category for 3 skills");
  });

  it.each([
    [
      "category-not-found",
      { type: "skill", count: 1, reread: "Re-read Skills" },
      "The category was deleted. Choose another category.",
    ],
    [
      "item-not-found",
      { type: "skill", count: 1, reread: "Re-read Skills" },
      "The Harness no longer contains the skill. Select Re-read Skills to update the list.",
    ],
    [
      "item-not-found",
      { type: "skill", count: 3, reread: "Re-read Skills" },
      "The Harness no longer contains a skill. Select Re-read Skills to update the list.",
    ],
    [
      "item-not-found",
      { type: "prompt", count: 1, reread: "Re-read Prompts" },
      "The Harness no longer contains the prompt. Select Re-read Prompts to update the list.",
    ],
    [
      "item-not-found",
      { type: "prompt", count: 1, reread: "Re-read Harness" },
      "The Harness no longer contains the prompt. Select Re-read Harness to update the list.",
    ],
    [
      "item-not-found",
      { type: "prompt", count: 2, reread: "Re-read Prompts" },
      "The Harness no longer contains a prompt. Select Re-read Prompts to update the list.",
    ],
    [
      "other",
      { type: "skill", count: 1, reread: "Re-read Skills" },
      "Choose the category again.",
    ],
  ] as const)(
    "states why Set category didn't land: %s, %o",
    (code, items, message) => {
      expect(categoryNotSet(code, items)).toEqual({
        level: "error",
        label: "Category not set",
        message,
      });
    },
  );

  it("labels the Category field without a hint", () => {
    expect(CATEGORY_FIELD).toEqual({ label: "Category" });
  });

  it("states a category the edit could not set after the prompt was edited", () => {
    expect(CATEGORY_NOT_SET_AFTER_EDIT).toEqual({
      level: "error",
      label: "Category not set",
      message:
        "The prompt was edited. Select Close, then select Set category on Prompts.",
    });
  });

  it.each([
    [3, 2, "Its 3 skills and 2 prompts show the new name."],
    [1, 1, "Its 1 skill and 1 prompt show the new name."],
    [2, 0, "Its 2 skills show the new name."],
    [1, 0, "Its 1 skill shows the new name."],
    [0, 3, "Its 3 prompts show the new name."],
    [0, 1, "Its 1 prompt shows the new name."],
  ])(
    "tells Rename category that %i skills and %i prompts follow",
    (skills, prompts, hint) => {
      expect(renameHint(skills, prompts)).toBe(hint);
    },
  );

  it("gives an empty category no rename hint", () => {
    expect(renameHint(0, 0)).toBeUndefined();
  });

  it.each([
    [
      3,
      2,
      "Its 3 skills and 2 prompts move to the category you choose. They stay in the Harness.",
    ],
    [
      1,
      0,
      "Its 1 skill moves to the category you choose. It stays in the Harness.",
    ],
    [
      0,
      1,
      "Its 1 prompt moves to the category you choose. It stays in the Harness.",
    ],
    [
      0,
      4,
      "Its 4 prompts move to the category you choose. They stay in the Harness.",
    ],
  ])(
    "tells Delete category where %i skills and %i prompts go",
    (skills, prompts, body) => {
      expect(deleteMoves(skills, prompts)).toBe(body);
    },
  );

  it("says an empty category holds nothing", () => {
    expect(plainText(emptyCategoryDeleted("Release notes"))).toBe(
      "No skills or prompts are in Release notes.",
    );
  });

  it.each([
    [
      "category-not-found",
      "The category was deleted. Select Re-read Categories to update the list.",
    ],
    ["other", "Select Rename category to try again."],
  ] as const)("states why Rename category didn't land: %s", (code, message) => {
    expect(notRenamed(code)).toEqual({
      level: "error",
      label: "Category not renamed",
      message,
    });
  });

  it.each([
    [
      "category-not-found",
      "The category was deleted. Select Re-read Categories to update the list.",
    ],
    ["other", "Select Delete category to try again."],
  ] as const)("states why Delete category didn't land: %s", (code, message) => {
    expect(notDeleted(code)).toEqual({
      level: "error",
      label: "Category not deleted",
      message,
    });
  });

  it.each([
    [
      "skill",
      "add",
      "code-review was imported. Select Close, then select Set category on Skills.",
    ],
    [
      "prompt",
      "update",
      "review-pr was updated. Select Close, then select Set category on Prompts.",
    ],
  ] as const)(
    "states that a %s's %s landed without its category",
    (type, mode, message) => {
      const name = type === "skill" ? "code-review" : "review-pr";
      const notice = categoryNotSetAfterImport(type, name, mode);
      expect(notice.label).toBe("Category not set");
      expect(plainText(notice.message)).toBe(message);
    },
  );
});
