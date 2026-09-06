import { describe, expect, it } from "vitest";
import { joinNames } from "./join-names";

describe("joinNames", () => {
  it("yields an empty string for an empty list", () => {
    expect(joinNames([])).toBe("");
  });

  it("names a single entry on its own", () => {
    expect(joinNames(["one"])).toBe("one");
  });

  it("joins two entries with and", () => {
    expect(joinNames(["one", "two"])).toBe("one and two");
  });

  it("separates three or more with commas before the last and", () => {
    expect(joinNames(["one", "two", "three"])).toBe("one, two and three");
  });
});
