import { describe, expect, it } from "vitest";
import {
  draftPrompt,
  promptCategory,
  promptDraftProblems,
  promptFieldProblems,
  readPromptFile,
  samePrompt,
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
      example: "",
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
      example: "",
    });
  });

  it("fills the example from the front matter, as written", () => {
    const raw =
      "---\ndescription: Review\nexample: |\n  Review #12.\n    Focus on tests.\n---\nReview $1.";

    expect(draftPrompt(raw, null).example).toBe(
      "Review #12.\n  Focus on tests.\n",
    );
  });

  it("drafts an example that is not text as empty", () => {
    expect(
      draftPrompt("---\nexample:\n  - one\n---\nReview it.", null).example,
    ).toBe("");
  });

  it("leaves front matter that does not parse in the text", () => {
    const raw = "---\ndescription: [unclosed\n---\nReview it.";

    expect(draftPrompt(raw, null)).toEqual({
      name: "",
      frontmatter: "",
      description: "",
      text: raw,
      example: "",
    });
  });
});

describe("promptCategory", () => {
  it("reads metadata.category from a drafted front matter block", () => {
    const { frontmatter } = draftPrompt(
      "---\ndescription: Reviews.\nmetadata:\n  category: Code review\n---\nReview.",
      null,
    );

    expect(promptCategory(frontmatter)).toBe("Code review");
  });

  it.each([
    ["no front matter", ""],
    ["a category that is not text", "metadata:\n  category: 3\n"],
    ["front matter that does not parse", "metadata: [\n"],
  ])("reads %s as no category", (_case, frontmatter) => {
    expect(promptCategory(frontmatter)).toBeNull();
  });
});

describe("readPromptFile", () => {
  it("returns an empty description and the whole file without front matter", () => {
    expect(readPromptFile("Review it.\n")).toEqual({
      description: "",
      text: "Review it.\n",
      example: "",
    });
  });

  it("reads a multi-line example and leaves the one-line description intact", () => {
    expect(
      readPromptFile(
        "---\ndescription: Review a PR\nexample: |\n  Review #12.\n\n  Focus on tests.\n---\nReview $1.\n",
      ),
    ).toEqual({
      description: "Review a PR",
      text: "Review $1.\n",
      example: "Review #12.\n\nFocus on tests.\n",
    });
  });

  it.each([
    ["no example key", "description: Review"],
    ["a list", "example:\n  - one\n  - two"],
    ["a number", "example: 3"],
    ["a blank value", "example: '  \n\n  '"],
  ])("reads %s as no example", (_, frontmatter) => {
    expect(readPromptFile(`---\n${frontmatter}\n---\nReview.`).example).toBe(
      "",
    );
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
    ).toEqual({
      description: "Review",
      text: "Line one\r\n  $1\r\n",
      example: "",
    });
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
      readPromptFile(
        writePromptFile({ frontmatter: "", description, text, example: "" }),
      ),
    ).toEqual({ description, text, example: "" });
  });

  const EXAMPLE = "Review #12.\n\n  Focus on: tests\n---\n- one\n";

  it.each([
    ["no front matter", ""],
    ["front matter with other keys", "model: haiku"],
    ["front matter holding an old example", "example: Old one"],
  ])("reads back a multi-line example written over %s", (_, frontmatter) => {
    const write = {
      frontmatter,
      description: "Review a PR",
      text: "Review $1.\n",
      example: EXAMPLE,
    };

    expect(readPromptFile(writePromptFile(write))).toEqual({
      description: "Review a PR",
      text: "Review $1.\n",
      example: EXAMPLE,
    });
  });

  it("writes the example as a block, keeping other keys and a one-line description", () => {
    expect(
      writePromptFile({
        frontmatter: "description: Old\nmetadata:\n  category: Code review",
        description: "Review a PR",
        text: "Review it.",
        example: "Review #12.\nFocus on tests.\n",
      }),
    ).toBe(
      "---\ndescription: Review a PR\nmetadata:\n  category: Code review\nexample: |\n  Review #12.\n  Focus on tests.\n---\nReview it.",
    );
  });

  it("changes the example in place", () => {
    expect(
      writePromptFile({
        frontmatter: "description: Old\nexample: Old one\nmodel: haiku",
        description: "Review",
        text: "Review it.",
        example: "New one",
      }),
    ).toBe(
      "---\ndescription: Review\nexample: New one\nmodel: haiku\n---\nReview it.",
    );
  });

  it.each([
    ["an example", "example: |\n  Old one\n"],
    ["an example that is not text", "example:\n  - one\n"],
  ])("removes %s when the example is empty", (_, held) => {
    expect(
      writePromptFile({
        frontmatter: `description: Old\n${held}model: haiku`,
        description: "Review",
        text: "Review it.",
        example: "",
      }),
    ).toBe("---\ndescription: Review\nmodel: haiku\n---\nReview it.");
  });

  it("removes the example when it holds only spaces and blank lines", () => {
    expect(
      writePromptFile({
        frontmatter: "description: Old\nexample: Old one\nmodel: haiku",
        description: "Review",
        text: "Review it.",
        example: "  \n\n ",
      }),
    ).toBe("---\ndescription: Review\nmodel: haiku\n---\nReview it.");
  });

  it("keeps the example when the front matter gives way", () => {
    const written = writePromptFile({
      frontmatter: "model: [unclosed",
      description: "Review",
      text: "Review it.",
      example: "Review #12.\n",
    });

    expect(written).toBe(
      "---\ndescription: Review\nexample: |\n  Review #12.\n---\nReview it.",
    );
  });

  it("writes only a description key above the text without front matter", () => {
    expect(
      writePromptFile({
        frontmatter: "",
        description: "Review a PR",
        text: "Review it.",
        example: "",
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
        example: "",
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
        example: "",
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
          example: "",
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
    example: "",
  };

  it("finds nothing wrong with valid fields", () => {
    expect(promptFieldProblems(valid)).toEqual([]);
  });

  it("names every broken rule of empty fields", () => {
    expect(
      promptFieldProblems({
        name: "",
        description: " ",
        text: "\n",
        example: "",
      }),
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

describe("promptDraftProblems", () => {
  const draft = {
    name: "review-pr",
    frontmatter: "",
    description: "Review a pull request",
    example: "",
  };

  it("counts the description block the written file adds toward 100 KB", () => {
    // 102,400 bytes of text fit alone; the written file adds the block.
    expect(
      promptDraftProblems({ ...draft, text: "a".repeat(102_400) }),
    ).toEqual(["long-text"]);
    expect(
      promptDraftProblems({ ...draft, text: "a".repeat(102_300) }),
    ).toEqual([]);
  });

  it("counts the example toward 100 KB", () => {
    const text = "a".repeat(60_000);

    expect(
      promptDraftProblems({ ...draft, text, example: "b".repeat(43_000) }),
    ).toEqual(["long-text"]);
    expect(
      promptDraftProblems({ ...draft, text, example: "b".repeat(42_000) }),
    ).toEqual([]);
  });

  it("counts the new example, not the one the front matter holds", () => {
    const text = "a".repeat(60_000);
    const frontmatter = `example: ${"b".repeat(10)}`;

    expect(
      promptDraftProblems({
        ...draft,
        frontmatter,
        text,
        example: "c".repeat(43_000),
      }),
    ).toEqual(["long-text"]);
  });
});

describe("samePrompt", () => {
  const prompt = {
    description: "Review a pull request",
    text: "Review $ARGUMENTS.\n",
    example: "Review #12.\n",
  };

  it("holds for two prompts with equal fields", () => {
    expect(samePrompt(prompt, { ...prompt })).toBe(true);
  });

  it.each([
    ["description", { ...prompt, description: "Review a PR" }],
    ["text", { ...prompt, text: "Review $1.\n" }],
    ["line endings", { ...prompt, text: "Review $ARGUMENTS.\r\n" }],
    ["example", { ...prompt, example: "Review #13.\n" }],
    ["missing example", { ...prompt, example: "" }],
  ])("tells two prompts apart by their %s", (_, other) => {
    expect(samePrompt(prompt, other)).toBe(false);
  });
});
