import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import {
  importSkillsNotice,
  importSkillsScanNotice,
  skillFolderRefusal,
} from "./import-skills-copy";

describe("Import skills copy", () => {
  it.each([
    [
      "empty-description",
      "SKILL.md has an empty description. Add one, then choose the folder again.",
    ],
    ["missing-manifest", "This folder has no SKILL.md, so it is not a skill."],
    [
      "deployed-copy",
      "Another Harness deployed this copy. Import the skill from that Harness's clone instead.",
    ],
    [
      "name-taken",
      "The Harness now holds a skill with this name. To replace it, select Import skills again. Choose the folder, then check it under Already in the Harness.",
    ],
    [
      "source-changed",
      "The folder changed during the import. Let the change finish, then select Import skills again.",
    ],
    [
      "not-found",
      "The folder was moved or deleted before Maestro could copy it.",
    ],
  ] as const)("states why %s cannot be imported", (refusal, sentence) => {
    expect(skillFolderRefusal(refusal)).toBe(sentence);
  });

  it("says nothing landed only when the server refused the request", () => {
    expect(
      importSkillsNotice(new HttpError(400, "x", "bad-request", null)),
    ).toMatchObject({
      label: "Skills not imported",
      message: "Nothing was imported. Select Import skills again.",
    });
    expect(
      importSkillsNotice(new HttpError(500, "x", "internal", null)),
    ).toMatchObject({ label: "Import not confirmed" });
    expect(importSkillsNotice(new TypeError("offline"))).toMatchObject({
      label: "Import not confirmed",
    });
  });

  it("asks for another read when the scan was not answered", () => {
    expect(importSkillsScanNotice(new TypeError("offline"))).toMatchObject({
      label: "Folder not read",
      message:
        "The Maestro server did not answer. Select Import skills to read the folder again.",
    });
  });
});
