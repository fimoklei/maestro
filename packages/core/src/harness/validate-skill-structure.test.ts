import { describe, expect, it } from "vitest";
import { validateSkillStructure } from "./validate-skill-structure";

const manifest = (body: string) => `---\n${body}\n---\n\nBody text.\n`;

describe("validateSkillStructure", () => {
  it("passes a manifest with a non-empty description", () => {
    expect(
      validateSkillStructure(manifest("description: Plans a release")),
    ).toBeNull();
  });

  it("reports a missing SKILL.md", () => {
    expect(validateSkillStructure(null)).toBe("missing-manifest");
  });

  it("reports frontmatter that has no block at all", () => {
    expect(validateSkillStructure("Just a body, no frontmatter.")).toBe(
      "invalid-frontmatter",
    );
  });

  it("reports frontmatter that does not parse as YAML", () => {
    expect(validateSkillStructure(manifest("description: : ]["))).toBe(
      "invalid-frontmatter",
    );
  });

  it("reports an absent description key as an empty description", () => {
    expect(validateSkillStructure(manifest("name: planner"))).toBe(
      "empty-description",
    );
  });

  it("reports a blank description as empty", () => {
    expect(validateSkillStructure(manifest('description: "   "'))).toBe(
      "empty-description",
    );
  });

  it("reports a closing delimiter that is not a line of its own", () => {
    expect(validateSkillStructure("---\ndescription: ok\n---junk\n")).toBe(
      "invalid-frontmatter",
    );
  });

  it("reports frontmatter that is a list rather than a mapping", () => {
    expect(validateSkillStructure("---\n- one\n- two\n---\n")).toBe(
      "invalid-frontmatter",
    );
  });

  it("reports frontmatter that is a bare scalar", () => {
    expect(validateSkillStructure("---\njust a sentence\n---\n")).toBe(
      "invalid-frontmatter",
    );
  });
});
