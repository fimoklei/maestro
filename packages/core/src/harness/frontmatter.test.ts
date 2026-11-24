import { describe, expect, it } from "vitest";
import { readFrontmatter } from "./frontmatter";

const fileWith = (block: string): string => `---\n${block}\n---\nBody\n`;

describe("readFrontmatter", () => {
  it("reads the block, the body and the known fields", () => {
    const block =
      "name: review\ndescription: Reviews code\nexample: Review this";
    expect(readFrontmatter(fileWith(block))).toEqual({
      block,
      body: "Body\n",
      fields: {
        name: "review",
        description: "Reviews code",
        example: "Review this",
      },
    });
  });

  it("reads nothing from a file without a frontmatter block", () => {
    expect(readFrontmatter("Just text\n")).toBeNull();
  });

  it("reads nothing from frontmatter that does not parse as YAML", () => {
    expect(readFrontmatter(fileWith("description: [unclosed"))).toBeNull();
  });

  it.each([
    ["a list", "- one\n- two"],
    ["a scalar", "just words"],
    ["null", "~"],
  ])("reads nothing from frontmatter that is %s", (_, block) => {
    expect(readFrontmatter(fileWith(block))).toBeNull();
  });

  it("drops a field of the wrong type and keeps the others", () => {
    const block = "name: 42\ndescription: Reviews code\nexample:\n  - one";
    expect(readFrontmatter(fileWith(block))?.fields).toStrictEqual({
      name: undefined,
      description: "Reviews code",
      example: undefined,
      category: undefined,
    });
  });

  it("reads metadata.category, trimmed", () => {
    const block = "metadata:\n  category: '  Code review  '";
    expect(readFrontmatter(fileWith(block))?.fields.category).toBe(
      "Code review",
    );
  });

  it.each([
    ["absent", "description: Reviews code"],
    ["blank", "metadata:\n  category: '   '"],
    ["the reserved name", "metadata:\n  category: No category"],
    ["not text", "metadata:\n  category: 7"],
    ["under a metadata list", "metadata:\n  - category"],
  ])("reads no category when it is %s", (_, block) => {
    const frontmatter = readFrontmatter(fileWith(block));
    expect(frontmatter).not.toBeNull();
    expect(frontmatter?.fields.category).toBeUndefined();
  });

  it("keeps the other fields when the category is not valid", () => {
    const block =
      "description: Reviews code\nmetadata:\n  category: No category";
    expect(readFrontmatter(fileWith(block))?.fields.description).toBe(
      "Reviews code",
    );
  });
});
