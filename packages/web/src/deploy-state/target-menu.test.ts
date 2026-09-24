import { describe, expect, it } from "vitest";
import { type MenuFacts, targetMenuItems } from "./target-menu";

const ON_LATEST = {
  release: "v0.3.4",
  latestRelease: "v0.3.4",
  changed: 0,
  changedSkills: [],
  selection: ["tdd"],
  selected: 1,
  comparedAt: "2026-09-24T10:00:00Z",
};

const IN_SYNC: MenuFacts = {
  behind: false,
  head: ON_LATEST,
  readFailed: false,
  skills: 1,
};

const menu = (facts: Partial<MenuFacts>, retrying = false) =>
  targetMenuItems({ ...IN_SYNC, ...facts }, retrying).map((item) =>
    item.disabled ? `${item.label} (disabled)` : item.label,
  );

describe("targetMenuItems", () => {
  it("keeps Update target and the retry on an In sync target, disabled with their causes", () => {
    expect(menu({})).toEqual([
      "Deploy skill",
      "Update target — on the latest release (disabled)",
      "Retry update — nothing to retry (disabled)",
    ]);
  });

  it("offers Update target on a behind target", () => {
    expect(
      menu({ behind: true, head: { ...ON_LATEST, release: "v0.3.2" } }),
    ).toEqual([
      "Deploy skill",
      "Update target",
      "Retry update — nothing to retry (disabled)",
    ]);
  });

  // #1066: an operation that stands is the next step, so its retry leads.
  it("offers the retry of the operation that stopped first, and blocks Update target", () => {
    expect(
      menu({ pending: { kind: "remove", release: "v0.3.4", desired: [] } }),
    ).toEqual([
      "Retry removal",
      "Deploy skill",
      "Update target — unfinished operation (disabled)",
    ]);
  });

  it("blocks the retry while it runs", () => {
    expect(
      menu(
        { pending: { kind: "deploy", release: "v0.3.4", desired: ["tdd"] } },
        true,
      ),
    ).toEqual([
      "Retry deploy — already running (disabled)",
      "Deploy skill",
      "Update target — unfinished operation (disabled)",
    ]);
  });

  it("claims nothing about a target it could not read", () => {
    expect(menu({ readFailed: true })).toEqual([
      "Deploy skill",
      "Update target — target not read (disabled)",
      "Retry update — target not read (disabled)",
    ]);
    expect(menu({ skills: null, head: undefined })).toEqual([
      "Deploy skill",
      "Update target — target not read (disabled)",
      "Retry update — target not read (disabled)",
    ]);
  });

  it("names why an empty, pinned or unchecked target has no update", () => {
    expect(menu({ head: undefined, skills: 0 })[1]).toBe(
      "Update target — nothing deployed (disabled)",
    );
    expect(
      menu({
        head: undefined,
        pinned: [{ release: "v0.3.1", skills: 3 }],
      })[1],
    ).toBe("Update target — pinned per skill (disabled)");
    expect(menu({ head: { ...ON_LATEST, latestRelease: null } })[1]).toBe(
      "Update target — latest release unknown (disabled)",
    );
  });
});
