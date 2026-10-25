import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { readNotice } from "../test-utils";
import { EDIT_PROMPT } from "../ui/control-labels";
import { plainText } from "../ui/phrase";
import {
  CHOOSE_FILE_HINT,
  editPromptNotice,
  editPromptTitle,
  harnessPromptReadNotice,
  importPromptNotice,
  longTextNotice,
  NOT_TEXT_FILE_NOTICE,
  NOTHING_CHANGED,
  PROMPT_FIELD_ERRORS,
  PROMPT_FIELD_HINTS,
  PROMPT_SOURCE_LABEL,
  PROMPT_SOURCES,
  PROMPT_TAKEN_NOTICE,
  promptReadNotice,
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
    expect(PROMPT_SOURCE_LABEL).toBe("Prompt source");
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
      "Link in the Harness",
      "Nothing was imported. Replace the link with a real file or folder, then select Import prompt again.",
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

describe("Edit prompt copy", () => {
  it("titles the dialog by the prompt and states why its button is blocked", () => {
    expect(EDIT_PROMPT).toBe("Edit prompt");
    expect(editPromptTitle("pr-review")).toBe("Edit pr-review");
    expect(NOTHING_CHANGED).toBe("Change the description or text.");
  });

  it("refuses a text over 100 KB naming Edit prompt", () => {
    expect(longTextNotice("Edit prompt")).toEqual({
      level: "error",
      label: "Prompt over 100 KB",
      message: "Shorten the text to 100 KB or less. Then select Edit prompt.",
    });
  });

  it.each([
    [
      "not-configured",
      "No Harness connected",
      "Select Change Harness location in Settings, then select Edit prompt again.",
    ],
    [
      "destination-unsafe",
      "Link in the Harness",
      "Nothing was edited. Replace the link with a real file or folder, then select Edit prompt again.",
    ],
    [
      "destination-unreadable",
      "Prompts folder not read",
      "Nothing was edited. Make the Harness clone readable, then select Edit prompt again.",
    ],
    [
      "import-in-progress",
      "Harness busy",
      "Wait for that change to finish, then select Edit prompt again.",
    ],
    [
      "write-failed",
      "Prompt not edited",
      "The Harness is as it was. Make the prompts folder writable, then select Edit prompt again.",
    ],
    [
      "unknown",
      "Prompt not edited",
      "The Maestro server did not answer, and nothing reached the Harness. Select Edit prompt again.",
    ],
  ])(
    "states %s in the Import prompt words, for an edit",
    (code, label, message) => {
      expect(importPromptNotice(refusal(code), "Edit prompt")).toMatchObject({
        level: "error",
        label,
        message,
      });
    },
  );
});

describe("Edit prompt refusal copy", () => {
  const missing = new HttpError(404, "refused", "prompt-missing");

  it.each([
    [
      "harness",
      "Nothing was edited. Select Re-read Harness, then select Restore prompt.",
    ],
    [
      "prompts",
      "Nothing was edited. Select Harness, then select Restore prompt.",
    ],
  ] as const)(
    "states a file gone on submit from the %s screen",
    (screen, message) => {
      expect(
        readNotice(editPromptNotice(missing, { name: "pr-review", screen })),
      ).toEqual({
        level: "error",
        label: "Prompt not in your clone",
        message,
        detail:
          "Something removed the pr-review file from your clone after this dialog opened.",
      });
    },
  );

  it("states a file changed since the dialog opened", () => {
    expect(
      readNotice(
        editPromptNotice(refusal("prompt-changed"), {
          name: "pr-review",
          screen: "prompts",
        }),
      ),
    ).toEqual({
      level: "error",
      label: "Prompt out of date",
      message:
        "Nothing was edited. Copy your text, select Close, then select Edit prompt again.",
      detail: "The pr-review file changed after this dialog opened.",
    });
  });

  it("states any other refusal in the Import prompt words", () => {
    expect(
      editPromptNotice(refusal("write-failed"), {
        name: "pr-review",
        screen: "harness",
      }),
    ).toEqual(importPromptNotice(refusal("write-failed"), "Edit prompt"));
  });

  it("states a read on the Harness screen that found no file", () => {
    expect(harnessPromptReadNotice(refusal("prompt-missing"))).toEqual({
      level: "error",
      label: "Prompt not in your clone",
      message:
        "Nothing was edited. Select Re-read Harness, then select Restore prompt.",
    });
  });

  it.each([
    [true, "Select Harness, then select Restore prompt."],
    [
      false,
      "Pull the latest changes in your Git tool, then select Edit prompt again.",
    ],
  ])(
    "states a read that found no file, local deletion %s",
    (localDeletion, message) => {
      expect(
        readNotice(
          promptReadNotice(missing, {
            name: "pr-review",
            origin: "github.com/fimoklei/agent-harness",
            localDeletion,
          }),
        ),
      ).toEqual({
        level: "error",
        label: "Prompt not in your clone",
        message,
        detail:
          "pr-review is on github.com/fimoklei/agent-harness but not in your clone.",
      });
    },
  );

  it("leaves out the origin it could not read", () => {
    expect(
      promptReadNotice(missing, {
        name: "pr-review",
        origin: null,
        localDeletion: false,
      }),
    ).not.toHaveProperty("detail");
  });
});
