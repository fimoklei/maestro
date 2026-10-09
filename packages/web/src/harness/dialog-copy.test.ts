import { describe, expect, it } from "vitest";
import {
  ADVISORY_TEXT,
  CREATE_RELEASE_UNAVAILABLE,
  DELETE_UNAVAILABLE,
  FINDING_TEXT,
  FOLDER_MISSING,
  RELEASE_UNAVAILABLE,
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

  it("states why Create a release cannot open its plan", () => {
    expect(CREATE_RELEASE_UNAVAILABLE).toEqual({
      rereading: "re-reading Harness",
      notRead: "GitHub not read",
    });
  });

  it("states why Publish release cannot run yet", () => {
    expect(RELEASE_UNAVAILABLE).toEqual({
      loading: "release plan still loading",
      error: "release plan did not load",
      empty: "no changes since last release",
    });
  });

  it("asks for the skill folder when Import skill is submitted without one", () => {
    expect(FOLDER_MISSING).toBe("Enter the skill folder's absolute path.");
  });

  it("states why Delete skill cannot run yet, in screen names", () => {
    expect(DELETE_UNAVAILABLE).toEqual({
      checking: "checking your clone",
      failed: "clone not read",
      "no-harness": "no Harness connected",
      "not-in-clone": "not in your clone",
    });
  });
});
