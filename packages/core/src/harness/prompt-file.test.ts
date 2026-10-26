import { describe, expect, it } from "vitest";
import {
  draftPrompt,
  promptFieldProblems,
  readPromptFile,
  writePromptFile,
} from "./prompt-file";

describe("draftPrompt", () => {
  it("suggests a name from a file name without its .prompt.md suffix", () => {
    expect(draftPrompt("Review the PR.", "review-pr.prompt.md").name).toBe(
      "review-pr",
    );
  });

  it("suggests no name from pasted text", () => {
    expect(draftPrompt("# Review PR\n\nReview the PR.", null).name).toBe("");
  });

  it("moves the front matter out of the text and keeps it whole", () => {
    const raw =
      "---\ndescription: Review a pull request\nallowed-tools: Bash # read only\n---\nReview $ARGUMENTS.\n";

    expect(draftPrompt(raw, "review-pr.md")).toEqual({
      name: "review-pr",
      frontmatter:
        "description: Review a pull request\nallowed-tools: Bash # read only",
      description: "Review a pull request",
      text: "Review $ARGUMENTS.\n",
    });
  });

  it("joins a multi-line description into one line", () => {
    const raw =
      "---\ndescription: |\n  Review a pull request\n  and list the risks\n---\nReview it.";

    expect(draftPrompt(raw, null)).toEqual({
      name: "",
      frontmatter:
        "description: |\n  Review a pull request\n  and list the risks",
      description: "Review a pull request and list the risks",
      text: "Review it.",
    });
  });

  it("leaves front matter that does not parse in the text", () => {
    const raw = "---\ndescription: [unclosed\n---\nReview it.";

    expect(draftPrompt(raw, null)).toEqual({
      name: "",
      frontmatter: "",
      description: "",
      text: raw,
    });
  });
});

describe("readPromptFile", () => {
  it("returns an empty description and the whole file without front matter", () => {
    expect(readPromptFile("Review it.\n")).toEqual({
      description: "",
      text: "Review it.\n",
    });
  });

  it("returns an empty description for broken front matter", () => {
    expect(
      readPromptFile("---\ndescription: [unclosed\n---\nReview it.")
        .description,
    ).toBe("");
  });

  it("keeps the text after the front matter byte for byte", () => {
    expect(
      readPromptFile(
        "---\r\ndescription: Review\r\n---\r\nLine one\r\n  $1\r\n",
      ),
    ).toEqual({ description: "Review", text: "Line one\r\n  $1\r\n" });
  });
});

describe("writePromptFile", () => {
  it.each([
    "Review: the PR",
    "Fix #123 first",
    `Say "hi" and 'bye'`,
    "--- not a delimiter",
    "- a list marker",
    `${"long ".repeat(60)}end`,
  ])("reads back the description %j unchanged", (description) => {
    const text = "Review $ARGUMENTS.\r\n";

    expect(
      readPromptFile(writePromptFile({ frontmatter: "", description, text })),
    ).toEqual({
      description,
      text,
    });
  });

  it("writes only a description key above the text without front matter", () => {
    expect(
      writePromptFile({
        frontmatter: "",
        description: "Review a PR",
        text: "Review it.",
      }),
    ).toBe("---\ndescription: Review a PR\n---\nReview it.");
  });

  it("sets the description inside the front matter, keeping keys, order and comments", () => {
    expect(
      writePromptFile({
        frontmatter:
          "argument-hint: '[scope]' # shown in the menu\ndescription: Old\nmodel: haiku",
        description: "Write a commit message",
        text: "Write it.",
      }),
    ).toBe(
      "---\nargument-hint: '[scope]' # shown in the menu\ndescription: Write a commit message\nmodel: haiku\n---\nWrite it.",
    );
  });

  it("adds the description to front matter that lacks one", () => {
    expect(
      writePromptFile({
        frontmatter: "model: haiku",
        description: "Review",
        text: "Review it.",
      }),
    ).toBe("---\nmodel: haiku\ndescription: Review\n---\nReview it.");
  });

  it.each([
    ["a document start", "--- \nmodel: haiku"],
    ["a directive", "%YAML 1.2\n---\nmodel: haiku"],
    ["a list", "- model"],
    ["broken YAML", "model: [unclosed"],
  ])(
    "writes only the description over front matter holding %s",
    (_, frontmatter) => {
      expect(
        writePromptFile({
          frontmatter,
          description: "Review",
          text: "Review it.",
        }),
      ).toBe("---\ndescription: Review\n---\nReview it.");
    },
  );
});

describe("promptFieldProblems", () => {
  const valid = {
    name: "review-pr",
    description: "Review a pull request",
    text: "Review $ARGUMENTS.",
  };

  it("finds nothing wrong with valid fields", () => {
    expect(promptFieldProblems(valid)).toEqual([]);
  });

  it("names every broken rule of empty fields", () => {
    expect(
      promptFieldProblems({ name: "", description: " ", text: "\n" }),
    ).toEqual(["empty-name", "empty-description", "empty-text"]);
  });

  it.each(["../x", "Review-PR", "review--pr", "a".repeat(65)])(
    "refuses the name %j",
    (name) => {
      expect(promptFieldProblems({ ...valid, name })).toEqual(["invalid-name"]);
    },
  );

  it.each(["Review\n---", "Review\r\nit"])(
    "refuses a line break in the description %j",
    (description) => {
      expect(promptFieldProblems({ ...valid, description })).toEqual([
        "multiline-description",
      ]);
    },
  );

  it("refuses a description over 1024 characters", () => {
    expect(
      promptFieldProblems({ ...valid, description: "a".repeat(1025) }),
    ).toEqual(["long-description"]);
    expect(
      promptFieldProblems({ ...valid, description: "a".repeat(1024) }),
    ).toEqual([]);
  });

  it("counts the text limit in UTF-8 bytes, not characters", () => {
    // 60,000 characters, 120,000 bytes.
    expect(promptFieldProblems({ ...valid, text: "é".repeat(60_000) })).toEqual(
      ["long-text"],
    );
    expect(
      promptFieldProblems({ ...valid, text: "a".repeat(102_400) }),
    ).toEqual([]);
    expect(
      promptFieldProblems({ ...valid, text: "a".repeat(102_401) }),
    ).toEqual(["long-text"]);
  });
});
