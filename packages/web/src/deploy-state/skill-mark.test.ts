import { describe, expect, it } from "vitest";
import { skillMark } from "./skill-mark";

const words = (mark: ReturnType<typeof skillMark>) =>
  mark === null ? null : `${mark.glyph} ${mark.word}`;

describe("skillMark", () => {
  it("puts local edits ahead of every drift reading", () => {
    expect(words(skillMark("local-edits", "behind"))).toBe("✎ Local edits");
    expect(words(skillMark("local-edits", "no-longer-released"))).toBe(
      "✎ Local edits",
    );
  });

  it("puts an unverified copy ahead of No longer released and Behind", () => {
    expect(words(skillMark("unverified", "no-longer-released"))).toBe(
      "? Unverified",
    );
    expect(words(skillMark("unverified", "behind"))).toBe("? Unverified");
  });

  it("puts No longer released ahead of Behind", () => {
    expect(words(skillMark(undefined, "no-longer-released"))).toBe(
      "⚠ No longer released",
    );
  });

  it("marks a changed skill Behind and an identical one Up to date", () => {
    expect(words(skillMark(undefined, "behind"))).toBe("↑ Behind");
    expect(words(skillMark(undefined, "up-to-date"))).toBe("✓ Up to date");
    // The release moved, this skill did not: identical at both.
    expect(words(skillMark(undefined, "older-tag"))).toBe("✓ Up to date");
  });

  it("reads a check that could not run as unknown, never as up to date", () => {
    expect(words(skillMark(undefined, "unknown"))).toBe("? Unknown");
    expect(words(skillMark(undefined, "unverified"))).toBe("? Unverified");
  });

  it("tells the two Unverified readings apart by their hint", () => {
    expect(skillMark("unverified", "up-to-date")?.hint).toBe(
      "This copy could not be verified against a recorded baseline",
    );
    expect(skillMark(undefined, "unverified")?.hint).toBe(
      "Could not reach the Harness location to check for updates",
    );
  });

  it("marks nothing while the check is still running", () => {
    expect(skillMark(undefined, "pending")).toBeNull();
  });
});
