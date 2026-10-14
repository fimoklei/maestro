import { describe, expect, it } from "vitest";
import { cardReadingFields } from "../../packages/server/src/release-head-response";

const HEAD = {
  release: "v0.3.2",
  latestRelease: "v0.3.4",
  changed: 1,
  selected: 1,
  comparedAt: "2026-09-12T10:00:00.000Z",
};

// The edge's own check, for a head no composed reader produces today.
describe("card readings at the HTTP edge", () => {
  it("passes a Release head whose release is a release tag", () => {
    expect(cardReadingFields({ releaseHead: HEAD })).toEqual({
      releaseHead: HEAD,
    });
  });

  it("drops a Release head whose release is not a release tag", () => {
    expect(
      cardReadingFields({ releaseHead: { ...HEAD, release: "main" } }),
    ).toEqual({});
  });
});
