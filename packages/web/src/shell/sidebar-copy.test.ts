import { describe, expect, it } from "vitest";
import { behindCount, UNKNOWN_COUNT } from "./sidebar-copy";

describe("sidebar counter copy", () => {
  it("counts the behind targets", () => {
    expect(behindCount(1)).toBe("1 behind");
    expect(behindCount(3)).toBe("3 behind");
  });

  it("shows a failed read as ? and says Unknown", () => {
    expect(UNKNOWN_COUNT).toEqual({ shown: "?", spoken: "Unknown" });
  });
});
