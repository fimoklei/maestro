import { describe, expect, it } from "vitest";
import {
  IMPORTED_PROMPTS_NEXT_STEP,
  importPromptsConfirm,
  importPromptsNotice,
  importPromptsReportHeading,
  NO_PROMPT_QUALIFIES,
  NOTHING_CHECKED,
  PROMPT_FILE_REFUSALS,
} from "./import-prompts-copy";

describe("import prompts copy", () => {
  it("counts the checked prompts in the confirm", () => {
    expect(importPromptsConfirm(0)).toBe("Import prompts");
    expect(importPromptsConfirm(1)).toBe("Import 1 prompt");
    expect(importPromptsConfirm(2)).toBe("Import 2 prompts");
  });

  it("states why the confirm is blocked", () => {
    expect(NO_PROMPT_QUALIFIES).toBe("You cannot import any of these prompts.");
    expect(NOTHING_CHECKED).toBe("Check at least one prompt.");
  });

  it("gives each refused file one reason and its next step", () => {
    expect(PROMPT_FILE_REFUSALS).toEqual({
      "not-text":
        "Maestro reads only UTF-8 text. Save the file as UTF-8, then choose it again.",
      "empty-name":
        "The file name has no letters or digits. Rename the file, then choose it again.",
      "invalid-name":
        "The file name does not make a usable prompt name. Rename the file, then choose it again.",
      "same-name":
        "Another chosen file has the same name. Rename the file, then choose it again.",
      "empty-description":
        "The file has no description in its front matter. Add one, then choose the file again.",
      "multiline-description":
        "Keep the description to one line of 1,024 characters or less. Then choose the file again.",
      "long-description":
        "Keep the description to one line of 1,024 characters or less. Then choose the file again.",
      "empty-text":
        "The file has no prompt text below its front matter. Add the text, then choose the file again.",
      "long-text": "The file is over 100 KB. Shorten it, then choose it again.",
      "prompt-taken":
        "The Harness now has a prompt with this name. To replace it, select Import prompts again. Choose the file, then check it under Already in the Harness.",
      "destination-unsafe":
        "The prompt file in the Harness is a link. Replace the link with a real file, then import the prompt again.",
      "destination-unreadable":
        "Make the prompts folder writable, then select Import prompts again.",
      "write-failed":
        "Make the prompts folder writable, then select Import prompts again.",
    });
  });

  it("reports how many prompts landed and what comes next", () => {
    expect(importPromptsReportHeading(2, 3)).toBe("Imported 2 of 3 prompts");
    expect(importPromptsReportHeading(1, 1)).toBe("Imported 1 of 1 prompt");
    expect(IMPORTED_PROMPTS_NEXT_STEP).toBe(
      "Each is now a Pending proposal. Open the row's menu, then select Propose change.",
    );
  });

  it("says the server did not answer when no table row covers the failure", () => {
    expect(importPromptsNotice(new Error("offline"))).toEqual({
      level: "error",
      label: "Prompts not imported",
      message:
        "The Maestro server did not answer, so some prompts may have landed. Select Close, then check the Harness screen.",
    });
  });
});
