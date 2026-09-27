import { describe, expect, it } from "vitest";
import {
  ADVISORY_TEXT,
  FINDING_TEXT,
  IMPORT_UNAVAILABLE,
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

  it("states why Publish release cannot run yet", () => {
    expect(RELEASE_UNAVAILABLE).toEqual({
      loading: "release plan still loading",
      error: "release plan did not load",
      empty: "no changes since last release",
    });
  });

  it("states why Import skill cannot run yet", () => {
    expect(IMPORT_UNAVAILABLE).toEqual({
      idle: "no folder chosen yet",
      loading: "folder check still running",
      error: "folder check did not load",
      source: "folder cannot be used",
      name: "name cannot be used",
    });
  });
});
