import { describe, expect, it } from "vitest";
import { proposeSkillSlug } from "./skill-slug";

describe("proposeSkillSlug", () => {
  it("keeps a folder name that is already a slug", () => {
    expect(proposeSkillSlug("code-review")).toBe("code-review");
  });

  it("lowercases and joins separated words with one hyphen", () => {
    expect(proposeSkillSlug("Code Review_v2")).toBe("code-review-v2");
  });

  it("drops leading and trailing separators", () => {
    expect(proposeSkillSlug(".hidden-skill.")).toBe("hidden-skill");
  });

  it("proposes nothing where no slug character survives", () => {
    expect(proposeSkillSlug("...")).toBe("");
  });
});
