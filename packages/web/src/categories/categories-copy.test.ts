import { describe, expect, it } from "vitest";
import { plainText } from "../ui/phrase";
import {
  CATEGORIES_READ_FAILED,
  CATEGORIES_SENTENCE,
  CATEGORY_FIELD,
  CATEGORY_NAME_ERRORS,
  CATEGORY_NOT_ADDED,
  CATEGORY_NOT_SET_AFTER_EDIT,
  categoriesUnreadable,
  categoryCounts,
  categoryNotSet,
  deleteMoves,
  emptyCategoryDeleted,
  NO_CATEGORIES,
  NO_CATEGORIES_SENTENCE,
  nameExistsError,
  notDeleted,
  notRenamed,
  renameHint,
  setCategoryFor,
} from "./categories-copy";

// Approved sentences, as exact strings.
describe("Categories copy", () => {
  it("says where categories live, and what the empty list holds", () => {
    expect(CATEGORIES_SENTENCE).toBe(
      "Categories stay on this computer. Only you see them.",
    );
    expect(NO_CATEGORIES).toBe("No categories yet");
    expect(NO_CATEGORIES_SENTENCE).toBe("Categories appear here.");
  });

  it.each([
    [0, 0, "No skills or prompts"],
    [1, 0, "1 skill"],
    [3, 0, "3 skills"],
    [0, 1, "1 prompt"],
    [0, 2, "2 prompts"],
    [1, 1, "1 skill · 1 prompt"],
    [2, 1, "2 skills · 1 prompt"],
  ])("counts %i skills and %i prompts as %s", (skills, prompts, words) => {
    expect(categoryCounts(skills, prompts)).toBe(words);
  });

  it("states each name refusal as one field line", () => {
    expect(CATEGORY_NAME_ERRORS).toEqual({
      empty: "Enter a name.",
      "too-long": "Enter at most 64 characters.",
      "control-character": "Enter the name on one line.",
    });
    expect(nameExistsError("Code review")).toBe("Code review already exists.");
  });

  it("names the config file to repair by hand, then the control that reads it again", () => {
    const notice = categoriesUnreadable("/Users/me/.maestro/config.json");
    expect(notice.label).toBe("Categories not read");
    expect(plainText(notice.message)).toBe(
      "Repair the categories in /Users/me/.maestro/config.json manually. Then select Re-read Categories to try again.",
    );
  });

  it("names the control that recovers a failed read or add", () => {
    expect(CATEGORIES_READ_FAILED).toEqual({
      label: "Categories not read",
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
      "The category no longer exists. Choose another category.",
    ],
    [
      "item-not-found",
      "The Harness no longer holds it. Select Re-read Skills to update the list.",
    ],
    ["other", "Choose the category again."],
  ] as const)("states why Set category did not land: %s", (code, message) => {
    expect(categoryNotSet(code, "Re-read Skills")).toEqual({
      level: "error",
      label: "Category not set",
      message,
    });
  });

  it("labels the Category field with the hint drawn on the canvas", () => {
    expect(CATEGORY_FIELD).toEqual({
      label: "Category",
      hint: "Only you see this category.",
    });
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
      "The category no longer exists. Select Re-read Categories to update the list.",
    ],
    ["other", "Select Rename category to try again."],
  ] as const)(
    "states why Rename category did not land: %s",
    (code, message) => {
      expect(notRenamed(code)).toEqual({
        level: "error",
        label: "Category not renamed",
        message,
      });
    },
  );

  it.each([
    [
      "category-not-found",
      "The category no longer exists. Select Re-read Categories to update the list.",
    ],
    ["other", "Select Delete category to try again."],
  ] as const)(
    "states why Delete category did not land: %s",
    (code, message) => {
      expect(notDeleted(code)).toEqual({
        level: "error",
        label: "Category not deleted",
        message,
      });
    },
  );
});
