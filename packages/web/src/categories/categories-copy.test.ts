import { describe, expect, it } from "vitest";
import { plainText } from "../ui/phrase";
import {
  CATEGORIES_READ_FAILED,
  CATEGORIES_SENTENCE,
  CATEGORY_NAME_ERRORS,
  CATEGORY_NOT_ADDED,
  categoriesUnreadable,
  categoryCounts,
  NO_CATEGORIES,
  NO_CATEGORIES_SENTENCE,
  nameExistsError,
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

  it("names the config file to repair by hand", () => {
    const notice = categoriesUnreadable("/Users/me/.maestro/config.json");
    expect(notice.label).toBe("Categories not read");
    expect(plainText(notice.message)).toBe(
      "Repair the categories in /Users/me/.maestro/config.json by hand.",
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
});
