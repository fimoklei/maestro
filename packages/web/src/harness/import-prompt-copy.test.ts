import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { plainText } from "../ui/phrase";
import {
  CHOOSE_FILE_HINT,
  importPromptNotice,
  longTextNotice,
  NOT_TEXT_FILE_NOTICE,
  PROMPT_FIELD_ERRORS,
  PROMPT_FIELD_HINTS,
  PROMPT_SOURCES,
  PROMPT_TAKEN_NOTICE,
} from "./import-prompt-copy";

const refusal = (code: string) => new HttpError(409, "refused", code);

describe("Import prompt copy", () => {
  it("states each field's hint and error in the approved words", () => {
    expect(plainText(PROMPT_FIELD_HINTS.name)).toBe(
      "Maestro uses this as the file name in .maestro/prompts.",
    );
    expect(PROMPT_FIELD_HINTS.description).toBe(
      "One line, shown in the Prompts table.",
    );
    expect(PROMPT_FIELD_HINTS.text).toBe("Saved exactly as you enter it.");
    expect(PROMPT_FIELD_ERRORS).toEqual({
      "empty-name": "Enter a name.",
      "invalid-name":
        "A prompt name uses lowercase letters, digits and single hyphens, like pr-review.",
      "empty-description": "Enter a description.",
      "multiline-description":
        "Keep the description to one line of 1,024 characters or less.",
      "long-description":
        "Keep the description to one line of 1,024 characters or less.",
      "empty-text": "Enter the prompt text.",
    });
  });

  it("refuses a text over 100 KB with its own notice", () => {
    expect(longTextNotice("Import prompt")).toEqual({
      level: "error",
      label: "Prompt over 100 KB",
      message: "Shorten the text to 100 KB or less. Then select Import prompt.",
    });
    expect(longTextNotice("Update prompt").message).toBe(
      "Shorten the text to 100 KB or less. Then select Update prompt.",
    );
    expect(
      importPromptNotice(refusal("long-text"), "Import prompt"),
    ).toMatchObject({ label: "Prompt over 100 KB" });
  });

  it("states the Choose file tab and its refusal in the approved words", () => {
    expect(PROMPT_SOURCES.map((each) => each.label)).toEqual([
      "Paste text",
      "Choose file",
    ]);
    expect(CHOOSE_FILE_HINT).toBe("Use a .md or .txt file of 100 KB or less.");
    expect(NOT_TEXT_FILE_NOTICE).toEqual({
      level: "error",
      label: "Not a text file",
      message: "Maestro reads only UTF-8 text. Choose another file.",
    });
  });

  it("states a taken name under Name in the approved words", () => {
    expect(PROMPT_TAKEN_NOTICE).toEqual({
      level: "info",
      label: "Prompt already in the Harness",
      message: "Select Update prompt to replace its text and description.",
      detail: "To keep it, pick another name.",
    });
  });

  it("names Update prompt in a refusal while updating", () => {
    expect(
      importPromptNotice(refusal("import-in-progress"), "Update prompt"),
    ).toMatchObject({
      message:
        "Wait for that change to finish, then select Update prompt again.",
    });
  });

  it.each([
    [
      "not-configured",
      "No Harness connected",
      "Select Change Harness location in Settings, then select Import prompt again.",
    ],
    [
      "destination-unsafe",
      "Prompts folder outside the Harness",
      "Nothing was imported. Replace the link with a real folder, then select Import prompt again.",
    ],
    [
      "destination-unreadable",
      "Prompts folder not read",
      "Nothing was imported. Make the Harness clone readable, then select Import prompt again.",
    ],
    [
      "import-in-progress",
      "Harness busy",
      "Wait for that change to finish, then select Import prompt again.",
    ],
    [
      "write-failed",
      "Prompt not imported",
      "The Harness is as it was. Make the prompts folder writable, then select Import prompt again.",
    ],
    [
      "unknown",
      "Prompt not imported",
      "The Maestro server did not answer, and nothing reached the Harness. Select Import prompt again.",
    ],
  ])("states %s in Maestro's own words", (code, label, message) => {
    expect(importPromptNotice(refusal(code), "Import prompt")).toMatchObject({
      level: "error",
      label,
      message,
    });
  });
});
