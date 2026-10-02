import { describe, expect, it } from "vitest";
import { isValidSkillSlug } from "./package-ref";

describe("isValidSkillSlug", () => {
  it("accepts a kebab-case skill name", () => {
    expect(isValidSkillSlug("tdd")).toBe(true);
    expect(isValidSkillSlug("workflow-commit")).toBe(true);
    expect(isValidSkillSlug("a1-b2")).toBe(true);
  });

  it("rejects names that could escape into the command or the path", () => {
    expect(isValidSkillSlug("; rm -rf ~")).toBe(false);
    expect(isValidSkillSlug("../../.ssh/config")).toBe(false);
    expect(isValidSkillSlug("skills/tdd")).toBe(false);
    expect(isValidSkillSlug("tdd#v1.0.0")).toBe(false);
    expect(isValidSkillSlug("Tdd")).toBe(false);
    expect(isValidSkillSlug("")).toBe(false);
    expect(isValidSkillSlug("-tdd")).toBe(false);
    expect(isValidSkillSlug("tdd-")).toBe(false);
  });
});
