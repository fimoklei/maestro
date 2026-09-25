import { describe, expect, it } from "vitest";
import { isValidSkillSlug } from "../deploy/package-ref";
import {
  isPromotableSkillName,
  promoteBranch,
  promoteCompareUrl,
} from "./promote-branch";

const origin = { host: "github.com", ownerRepo: "fimoklei/agent-harness" };

describe("promoteBranch", () => {
  it("names the branch after the skill it carries", () => {
    expect(promoteBranch("tdd")).toBe("maestro/tdd");
  });
});

describe("promoteCompareUrl", () => {
  it("opens GitHub's pull-request form from the default branch to the promote branch", () => {
    expect(promoteCompareUrl(origin, "main", "tdd")).toBe(
      "https://github.com/fimoklei/agent-harness/compare/main...maestro/tdd?expand=1",
    );
  });

  it("escapes a default branch whose name carries a url character", () => {
    expect(promoteCompareUrl(origin, "release/2.0 rc", "tdd")).toBe(
      "https://github.com/fimoklei/agent-harness/compare/release%2F2.0%20rc...maestro/tdd?expand=1",
    );
  });
});

describe("isPromotableSkillName", () => {
  it("accepts an ordinary skill directory name", () => {
    expect(isPromotableSkillName("workflow-commit")).toBe(true);
    expect(isPromotableSkillName("tdd")).toBe(true);
  });

  it("holds a promotion to the one name a deploy could carry", () => {
    // A name a deploy's package ref refuses buys a branch nothing can install.
    for (const name of ["tdd.v2_1", "TDD", "my_skill"]) {
      expect(isPromotableSkillName(name)).toBe(isValidSkillSlug(name));
    }
  });

  it("refuses a name that would leave the skills directory", () => {
    // The name becomes a git pathspec and a ref.
    expect(isPromotableSkillName("..")).toBe(false);
    expect(isPromotableSkillName(".")).toBe(false);
    expect(isPromotableSkillName("../secrets")).toBe(false);
    expect(isPromotableSkillName("nested/skill")).toBe(false);
  });

  it("refuses a name git would not take as a ref, or no name at all", () => {
    expect(isPromotableSkillName("")).toBe(false);
    expect(isPromotableSkillName("-force")).toBe(false);
    expect(isPromotableSkillName("tdd.lock")).toBe(false);
    expect(isPromotableSkillName("tdd..v2")).toBe(false);
    expect(isPromotableSkillName("tdd.")).toBe(false);
    expect(isPromotableSkillName("two words")).toBe(false);
  });
});
