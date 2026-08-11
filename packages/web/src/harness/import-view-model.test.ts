import { describe, expect, it } from "vitest";
import {
  advisoryTexts,
  importEnabled,
  nameBlockerText,
  sourceBlockerText,
} from "./import-view-model";
import type { ImportCheck } from "./use-harness";

const clean: ImportCheck = {
  name: "code-review",
  sourceBlocker: null,
  nameBlocker: null,
  advisories: [],
};

describe("import refusal text", () => {
  it("names the folder's problem, never the name's", () => {
    expect(sourceBlockerText("missing-manifest")).toBe(
      "That folder has no SKILL.md, so it is not a skill.",
    );
    expect(sourceBlockerText(null)).toBeNull();
  });

  it("names the name's problem", () => {
    expect(nameBlockerText("name-taken")).toBe(
      "The Harness already has a skill with that name.",
    );
    expect(nameBlockerText(null)).toBeNull();
  });

  it("states each convention finding in order", () => {
    expect(advisoryTexts(["long-manifest", "long-description"])).toEqual([
      "SKILL.md is over 500 lines.",
      "The description is over 1,024 characters.",
    ]);
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

  it("closes on a name refusal", () => {
    expect(importEnabled({ ...clean, nameBlocker: "name-taken" })).toBe(false);
  });

  it("closes while no check is in hand", () => {
    expect(importEnabled(undefined)).toBe(false);
  });
});
