import { describe, expect, it } from "vitest";
import {
  advisoryTexts,
  importEnabled,
  importLabels,
  nameBlockerNotice,
  sourceBlockerNotice,
} from "./import-view-model";
import type { ImportCheck } from "./use-harness";

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
      message: "Pick the folder that holds the skill's SKILL.md.",
    });
    expect(sourceBlockerNotice(null)).toBeNull();
  });

  it("names the name's problem", () => {
    expect(nameBlockerNotice("name-taken")).toEqual({
      level: "error",
      label: "Name taken",
      message: "The Harness already holds a skill under it. Pick another name.",
    });
    expect(nameBlockerNotice(null)).toBeNull();
  });

  it("states each convention finding in order", () => {
    expect(advisoryTexts(["long-manifest", "long-description"])).toEqual([
      "SKILL.md is over 500 lines.",
      "The description is over 1,024 characters.",
    ]);
  });
});

describe("importLabels", () => {
  it("names the dialog after replacing when the check is an update", () => {
    expect(importLabels({ ...clean, mode: "update" })).toEqual({
      title: "Update a skill",
      confirm: "Update skill",
      busy: "Updating…",
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
      hint: "Maestro uses this as the folder name and updates the name in SKILL.md to match.",
    });
    expect(importLabels(undefined).confirm).toBe("Import skill");
  });
});

describe("importEnabled", () => {
  it("opens on a check that refuses nothing", () => {
    expect(importEnabled(clean)).toBe(true);
  });

  it("stays open while conventions are only reported", () => {
    expect(importEnabled({ ...clean, advisories: ["long-manifest"] })).toBe(
      true,
    );
  });

  it("closes on a source refusal", () => {
    expect(importEnabled({ ...clean, sourceBlocker: "deployed-copy" })).toBe(
      false,
    );
  });

  it("closes on a refusal the update mode raises", () => {
    expect(
      importEnabled({
        ...clean,
        mode: "update",
        sourceBlocker: "harness-copy-uncommitted",
      }),
    ).toBe(false);
  });

  it("closes on a name refusal", () => {
    expect(importEnabled({ ...clean, nameBlocker: "name-taken" })).toBe(false);
  });

  it("closes while no check is in hand", () => {
    expect(importEnabled(undefined)).toBe(false);
  });
});
