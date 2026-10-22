import { describe, expect, it } from "vitest";
import {
  ADVISORY_TEXT,
  CLONE_NOT_READ,
  FINDING_TEXT,
  FOLDER_MISSING,
  notInClone,
  skillChecksNotice,
} from "./dialog-copy";

describe("Harness dialog copy", () => {
  it("warns about skill checks in one wording, naming the step still open", () => {
    expect(
      skillChecksNotice("import", ["SKILL.md is over 500 lines."]),
    ).toEqual({
      level: "warning",
      label: "Skill checks found issues",
      message: "You can still import the skill.",
      items: ["SKILL.md is over 500 lines."],
    });
    expect(skillChecksNotice("update", []).message).toBe(
      "You can still update the skill.",
    );
    expect(skillChecksNotice("publish", []).message).toBe(
      "You can still publish the release.",
    );
  });

  it("states each release check as a fact about the skill", () => {
    expect(FINDING_TEXT).toEqual({
      "missing-manifest": "has no SKILL.md.",
      "invalid-frontmatter": "has frontmatter Maestro cannot read.",
      "empty-description": "has an empty description.",
    });
  });

  it("states each import check", () => {
    expect(ADVISORY_TEXT).toEqual({
      "long-manifest": "SKILL.md is over 500 lines.",
      "long-description": "The description is over 1,024 characters.",
    });
  });

  it("asks for the skill folder when Import skill is submitted without one", () => {
    expect(FOLDER_MISSING).toBe("Enter the skill folder's absolute path.");
  });

  it("states why Delete skill cannot run when the clone was not read", () => {
    expect(CLONE_NOT_READ).toBe("Maestro could not read your clone.");
  });

  it("states why Delete skill cannot run when the skill is not in the clone", () => {
    expect(notInClone("skill")).toBe(
      "Maestro could not find this skill in your clone.",
    );
  });
});
