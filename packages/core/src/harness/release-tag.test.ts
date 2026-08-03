import { describe, expect, it } from "vitest";
import { highestReleaseTag } from "./release-tag";

describe("highestReleaseTag", () => {
  it("reads v0.10.0 as higher than v0.9.0", () => {
    expect(
      highestReleaseTag([
        { name: "v0.9.0", commit: "aaa" },
        { name: "v0.10.0", commit: "bbb" },
      ]),
    ).toEqual({ name: "v0.10.0", commit: "bbb" });
  });

  it("ignores tags that are not a release version", () => {
    expect(
      highestReleaseTag([
        { name: "v1.0.0", commit: "aaa" },
        { name: "v2.0.0-rc.1", commit: "bbb" },
        { name: "release-3", commit: "ccc" },
        { name: "other-product-v9.9.9", commit: "ddd" },
      ]),
    ).toEqual({ name: "v1.0.0", commit: "aaa" });
  });

  it("has no previous release when no tag is a release version", () => {
    expect(highestReleaseTag([{ name: "nightly", commit: "aaa" }])).toBeNull();
  });
});
