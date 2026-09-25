import { describe, expect, it } from "vitest";
import { glyphFor, reading, worstReading } from "./status-reading";

describe("glyphFor", () => {
  it.each([
    ["good", "✓"],
    ["attention", "↑"],
    ["failed", "✕"],
    ["unknown", "?"],
    ["neutral", "–"],
  ] as const)("gives the %s family its glyph %s", (family, glyph) => {
    expect(glyphFor(family)).toBe(glyph);
  });
});

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

describe("worstReading", () => {
  const upToDate = reading("Up to date", "good");
  const behind = reading("Behind", "attention");
  const unknown = reading("Unknown", "unknown");
  const failed = reading("Failed", "failed");
  const notDeployed = reading("Not deployed", "neutral");

  it("lets a failure win over every other reading", () => {
    expect(worstReading([upToDate, failed, behind, unknown])).toBe(failed);
  });

  it("puts a reading that needs the reader above one that could not be told", () => {
    expect(worstReading([unknown, behind])).toBe(behind);
  });

  it("never lets an unknown reading pass as up to date", () => {
    expect(worstReading([upToDate, unknown])).toBe(unknown);
  });

  it("ranks a good reading above a neutral one", () => {
    expect(worstReading([notDeployed, upToDate])).toBe(upToDate);
  });

  it("keeps the first of two equally bad readings", () => {
    const alsoBehind = reading("Behind", "attention");
    expect(worstReading([behind, alsoBehind])).toBe(behind);
  });

  it("has no reading for an empty list", () => {
    expect(worstReading([])).toBeUndefined();
  });
});
