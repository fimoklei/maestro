import type { ImportCheck } from "@maestro/core";
import { describe, expect, it } from "vitest";
import {
  advisoryNotice,
  importLabels,
  isImportable,
  nameBlockerNotice,
  sourceBlockerNotice,
} from "./import-view-model";

const clean: ImportCheck = {
  mode: "add",
  name: "code-review",
  sourceBlocker: null,
  nameBlocker: null,
  advisories: [],
};

describe("import refusal text", () => {
  it("names the folder's problem, never the name's", () => {
    expect(sourceBlockerNotice("missing-manifest")).toEqual({
      level: "error",
      label: "No SKILL.md",
      message: "Choose the folder that holds the skill's SKILL.md.",
    });
    expect(sourceBlockerNotice(null)).toBeNull();
  });

  it("sends a broken SKILL.md back to choosing the folder again", () => {
    expect(sourceBlockerNotice("invalid-frontmatter")?.message).toBe(
      "Fix the SKILL.md frontmatter, then choose the folder again.",
    );
    expect(sourceBlockerNotice("empty-description")?.message).toBe(
      "Fill in the description in SKILL.md, then choose the folder again.",
    );
  });

  it("names the name's problem", () => {
    expect(nameBlockerNotice("name-taken")).toEqual({
      level: "error",
      label: "Name taken",
      message: "The Harness already holds a skill under it. Pick another name.",
    });
    expect(nameBlockerNotice(null)).toBeNull();
  });

  it("states each convention finding in order, as a warning", () => {
    expect(
      advisoryNotice(["long-manifest", "long-description"], "add"),
    ).toEqual({
      level: "warning",
      label: "Skill checks found issues",
      message: "You can still import the skill.",
      items: [
        "SKILL.md is over 500 lines.",
        "The description is over 1,024 characters.",
      ],
    });
  });

  it("names updating as the step still open on an update", () => {
    expect(advisoryNotice(["long-manifest"], "update")?.message).toBe(
      "You can still update the skill.",
    );
  });

  it("states no warning while the conventions hold", () => {
    expect(advisoryNotice([], "add")).toBeNull();
  });
});

describe("importLabels", () => {
  it("names the dialog after replacing when the check is an update", () => {
    expect(importLabels({ ...clean, mode: "update" })).toEqual({
      title: "Update a skill",
      confirm: "Update skill",
      verb: "update",
      hint: "Updating replaces the skill folder in the Harness.",
    });
  });

  it("names an unchanged update before offering another action", () => {
    expect(
      importLabels({
        ...clean,
        mode: "update",
        sourceBlocker: "nothing-to-carry-back",
      }),
    ).toMatchObject({ title: "No changes to update" });
  });

  it("names it after adding otherwise, including before a check comes back", () => {
    expect(importLabels(clean)).toMatchObject({
      confirm: "Import skill",
      verb: "import",
      hint: "Maestro uses this as the folder name and updates the name in SKILL.md to match.",
    });
    expect(importLabels(undefined).confirm).toBe("Import skill");
  });
});

describe("isImportable", () => {
  it("imports a check that refuses nothing", () => {
    expect(isImportable(clean)).toBe(true);
  });

  it("still imports while conventions are only reported", () => {
    expect(isImportable({ ...clean, advisories: ["long-manifest"] })).toBe(
      true,
    );
  });

  it("imports nothing without a check in hand", () => {
    expect(isImportable(undefined)).toBe(false);
  });

  it("imports nothing on a source refusal, in either mode", () => {
    expect(isImportable({ ...clean, sourceBlocker: "deployed-copy" })).toBe(
      false,
    );
    expect(
      isImportable({
        ...clean,
        mode: "update",
        sourceBlocker: "harness-copy-uncommitted",
      }),
    ).toBe(false);
  });

  it("imports nothing on a name refusal", () => {
    expect(isImportable({ ...clean, nameBlocker: "name-taken" })).toBe(false);
  });
});
