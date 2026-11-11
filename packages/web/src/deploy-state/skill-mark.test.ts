import { describe, expect, it } from "vitest";
import { skillMark } from "./skill-mark";

const words = (mark: ReturnType<typeof skillMark>) =>
  mark === null ? null : `${mark.glyph} ${mark.word}`;

describe("skillMark", () => {
  it("puts local edits ahead of every drift reading", () => {
    expect(words(skillMark("local-edits", "behind"))).toBe("⚠ Local edits");
    expect(words(skillMark("local-edits", "no-longer-released"))).toBe(
      "⚠ Local edits",
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
      "The deployment record cannot check this copy.",
    );
    expect(skillMark(undefined, "unverified")?.hint).toBe(
      "Update check did not run.",
    );
  });

  it("puts Edits in the Harness ahead of Behind and Up to date, in the neutral family", () => {
    for (const drift of [
      "behind",
      "up-to-date",
      "older-tag",
      "pending",
    ] as const) {
      const mark = skillMark("edits-in-harness", drift);
      expect(words(mark)).toBe("– Edits in the Harness");
      expect(mark?.family).toBe("neutral");
    }
  });

  it("puts No longer released and a check that could not run ahead of Edits in the Harness", () => {
    expect(words(skillMark("edits-in-harness", "no-longer-released"))).toBe(
      "⚠ No longer released",
    );
    expect(words(skillMark("edits-in-harness", "unverified"))).toBe(
      "? Unverified",
    );
    expect(words(skillMark("edits-in-harness", "unknown"))).toBe("? Unknown");
  });

  it("marks nothing while the check is still running", () => {
    expect(skillMark(undefined, "pending")).toBeNull();
  });
});
