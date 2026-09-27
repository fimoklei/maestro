import { describe, expect, it } from "vitest";
import {
  advisoryNotice,
  importLabels,
  importUnavailable,
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

describe("importUnavailable", () => {
  const ready = (check: ImportCheck) => ({ kind: "ready" as const, check });

  it("is available on a check that refuses nothing", () => {
    expect(importUnavailable(ready(clean))).toBeNull();
  });

  it("stays available while conventions are only reported", () => {
    expect(
      importUnavailable(ready({ ...clean, advisories: ["long-manifest"] })),
    ).toBeNull();
  });

  it("names the missing folder before one is chosen", () => {
    expect(importUnavailable({ kind: "idle" })).toBe("no folder chosen yet");
  });

  it("names the check while it runs", () => {
    expect(importUnavailable({ kind: "loading" })).toBe(
      "folder check still running",
    );
  });

  it("names a check that did not come back", () => {
    expect(
      importUnavailable({
        kind: "error",
        notice: { level: "error", label: "x", message: "y" },
      }),
    ).toBe("folder check did not load");
  });

  it("names the folder on a source refusal, in either mode", () => {
    expect(
      importUnavailable(ready({ ...clean, sourceBlocker: "deployed-copy" })),
    ).toBe("folder cannot be used");
    expect(
      importUnavailable(
        ready({
          ...clean,
          mode: "update",
          sourceBlocker: "harness-copy-uncommitted",
        }),
      ),
    ).toBe("folder cannot be used");
  });

  it("names the name on a name refusal", () => {
    expect(
      importUnavailable(ready({ ...clean, nameBlocker: "name-taken" })),
    ).toBe("name cannot be used");
  });
});
