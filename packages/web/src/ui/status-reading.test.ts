import { describe, expect, it } from "vitest";
import { reading } from "./status-reading";

describe("reading", () => {
  it("pairs a status word with its family's glyph", () => {
    expect(reading("Behind", "attention")).toEqual({
      word: "Behind",
      family: "attention",
      glyph: "↑",
    });
  });

  it("takes a glyph of its own where the family has two", () => {
    expect(reading("Local edits", "attention", "⚠").glyph).toBe("⚠");
  });
});
