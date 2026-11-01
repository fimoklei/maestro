import { describe, expect, it } from "vitest";
import { COPY_EXAMPLE } from "../ui/control-labels";
import { plainText } from "../ui/phrase";
import {
  COPY_PART_TEXT,
  NO_RELEASED_PROMPTS,
  NOT_COPIED,
  nameNotValidNotice,
  PROMPT_PARTS,
  PROMPT_PARTS_LABEL,
  promptsFactValue,
} from "./prompts-copy";

// The approved sentences; the rendered tests of the Prompts screen show them
// in place.
describe("Prompts copy", () => {
  it("offers the empty screen as an outcome, not a failure", () => {
    expect(NO_RELEASED_PROMPTS).toEqual({
      title: "No released prompts yet",
      description: "Prompts from the latest release appear here.",
    });
  });

  it("names the part the browser refused to copy, as spec #1742 states it", () => {
    expect(NOT_COPIED).toEqual({
      text: {
        label: "Prompt not copied",
        message:
          "The browser blocked the clipboard. Highlight the prompt text. Then copy it yourself.",
      },
      example: {
        label: "Example not copied",
        message:
          "The browser blocked the clipboard. Highlight the example text. Then copy it yourself.",
      },
    });
  });

  it("names the block's copy icon after the part on show, and the example's menu item", () => {
    expect(COPY_PART_TEXT).toEqual({
      text: "Copy prompt text",
      example: "Copy example text",
    });
    expect(COPY_EXAMPLE).toBe("Copy example");
  });

  it("names the pane block's switch as spec #1742 states it", () => {
    expect(PROMPT_PARTS_LABEL).toBe("Prompt or example");
    expect(PROMPT_PARTS.map((each) => each.label)).toEqual([
      "Prompt",
      "Example",
    ]);
  });

  it("words the Name not valid warning as spec #1590 states it", () => {
    const notice = nameNotValidNotice("Review_PR");
    expect(notice.label).toBe("Prompt name not valid");
    expect(plainText(notice.message)).toBe(
      "Rename Review_PR in your clone. Use lowercase letters, digits and single hyphens, like pr-review. Copy prompt still works.",
    );
  });

  it("counts every prompt, or X of N once a search or filter hides one", () => {
    expect(promptsFactValue(3, 3)).toBe("3");
    expect(promptsFactValue(1, 3)).toBe("1 of 3");
  });
});
