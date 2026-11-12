import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import {
  IMPORT_SKILLS_HINT,
  importSkillsNotice,
  importSkillsScanNotice,
  NO_SKILL_FOLDERS,
  SKILLS_FOLDER_MISSING,
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
      "The Harness already contains a skill with this name. To replace it, select Import skills again. Choose the folder, then check it under Already in the Harness.",
    ],
    [
      "destination-exists",
      "The Harness already contains a folder under this name. To import it under another name, select Import skill.",
    ],
    [
      "unsafe-link",
      "The folder contains a symbolic link. Replace the link with a real file, then select Import skills again.",
    ],
    [
      "hard-linked-file",
      "The folder contains a hard-linked file. Replace that file with a plain copy, then select Import skills again.",
    ],
    [
      "special-file",
      "The folder contains a special file. Take it out, then select Import skills again.",
    ],
    [
      "too-many-files",
      "The folder contains over 1,000 files. Remove the files the skill does not need, then select Import skills again.",
    ],
    [
      "source-changed",
      "The folder changed during the import. Wait for the change to finish, then select Import skills again.",
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
        "The Maestro server did not respond. Select Import skills to read the folder again.",
    });
  });

  it("asks for a skill folder, or a folder of skill folders", () => {
    expect(IMPORT_SKILLS_HINT).toBe(
      "Choose a skill folder, or a folder of skill folders.",
    );
    expect(SKILLS_FOLDER_MISSING).toBe(
      "Enter the absolute path of the folder that contains your skills.",
    );
    expect(NO_SKILL_FOLDERS).toEqual({
      label: "No skills in this folder",
      message:
        "A skill folder holds a SKILL.md. Choose a skill folder, or a folder of skill folders.",
    });
  });
});
