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

  it("refuses a name that would leave the skills directory", () => {
    // The name becomes a git pathspec and a ref.
    expect(isValidSkillSlug("..")).toBe(false);
    expect(isValidSkillSlug(".")).toBe(false);
    expect(isValidSkillSlug("../secrets")).toBe(false);
    expect(isValidSkillSlug("nested/skill")).toBe(false);
  });

  it("refuses a name git would not take as a ref", () => {
    expect(isValidSkillSlug("-force")).toBe(false);
    expect(isValidSkillSlug("tdd.lock")).toBe(false);
    expect(isValidSkillSlug("tdd..v2")).toBe(false);
    expect(isValidSkillSlug("tdd.")).toBe(false);
    expect(isValidSkillSlug("two words")).toBe(false);
  });

  it("refuses a dot, an underscore or a capital anywhere in the name", () => {
    expect(isValidSkillSlug("tdd.v2_1")).toBe(false);
    expect(isValidSkillSlug("TDD")).toBe(false);
    expect(isValidSkillSlug("my_skill")).toBe(false);
  });
});
