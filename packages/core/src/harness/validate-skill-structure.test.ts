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
});
