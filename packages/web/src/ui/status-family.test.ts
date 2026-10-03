import { describe, expect, it } from "vitest";
import { STATUS_TOKENS, WARNING_GLYPH } from "./status-family";

describe("STATUS_TOKENS", () => {
  it.each([
    ["good", "✓"],
    ["attention", "↑"],
    ["failed", "✕"],
    ["unknown", "?"],
    ["neutral", "–"],
  ] as const)("marks a %s status with %s", (family, glyph) => {
    expect(STATUS_TOKENS[family].glyph).toBe(glyph);
  });

  it("gives attention ⚠ for a warning rather than a lag", () => {
    expect(WARNING_GLYPH).toBe("⚠");
  });

  it.each([
    ["good", "green"],
    ["attention", "amber"],
    ["failed", "red"],
    ["unknown", "gray"],
    ["neutral", "gray"],
  ] as const)("colours a %s status from the %s pairs only", (family, hue) => {
    const { glyph: _glyph, ...colours } = STATUS_TOKENS[family];
    for (const value of Object.values(colours)) {
      expect(value).toMatch(new RegExp(`-${hue}-\\d+`));
    }
  });

  it("sets coloured status text in step 12 and its mark in step 11, on fill 3 and edge 7", () => {
    expect(STATUS_TOKENS.failed).toEqual({
      glyph: "✕",
      ink: "text-red-12",
      mark: "text-red-11",
      dot: "bg-red-11",
      fill: "bg-red-3",
      edge: "border-red-7",
      softEdge: "border-red-7/50",
    });
  });

  it("mutes neutral and unknown text to slate 11, so they differ by word only", () => {
    const { glyph: _n, ...neutral } = STATUS_TOKENS.neutral;
    const { glyph: _u, ...unknown } = STATUS_TOKENS.unknown;
    expect(unknown).toEqual(neutral);
    expect(neutral.ink).toBe("text-gray-11");
  });
});
