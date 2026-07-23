import { describe, expect, it } from "vitest";
import { hiddenStagedCount, toggleStaged } from "./bulk-selection";

describe("toggleStaged", () => {
  it("stages a name that was not staged", () => {
    expect([...toggleStaged(new Set(), "tdd")]).toEqual(["tdd"]);
  });

  it("unstages a name that was already staged", () => {
    expect([...toggleStaged(new Set(["tdd", "caveman"]), "tdd")]).toEqual([
      "caveman",
    ]);
  });

  it("never mutates the input set", () => {
    const staged = new Set(["tdd"]);
    toggleStaged(staged, "caveman");
    expect([...staged]).toEqual(["tdd"]);
  });
});

describe("hiddenStagedCount", () => {
  it("counts staged names absent from the visible set", () => {
    // tdd is staged but filtered out of view; caveman is staged and visible.
    expect(hiddenStagedCount(new Set(["tdd", "caveman"]), ["caveman"])).toBe(1);
  });

  it("is zero when every staged name is visible", () => {
    expect(
      hiddenStagedCount(new Set(["tdd", "caveman"]), ["caveman", "tdd"]),
    ).toBe(0);
  });

  it("is zero when nothing is staged", () => {
    expect(hiddenStagedCount(new Set(), ["caveman", "tdd"])).toBe(0);
  });
});
