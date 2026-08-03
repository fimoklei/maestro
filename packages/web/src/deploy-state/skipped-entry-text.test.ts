import { describe, expect, it } from "vitest";
import {
  skippedEntryKey,
  skippedEntryText,
  skippedNeedsAttention,
} from "./skipped-entry-text";

describe("skippedEntryText", () => {
  it("names the unsupported type of a skipped entry", () => {
    expect(
      skippedEntryText({
        reason: "unsupported-type",
        virtualPath: "hooks/format",
        packageType: "claude_hook",
      }),
    ).toBe(
      "Skipped hooks/format — Maestro does not manage claude_hook. Its files are still in place.",
    );
  });

  it("names the recorded type of an unsupported deployment and says the files stay", () => {
    const text = skippedEntryText({
      reason: "unmanageable-skill",
      virtualPath: "skills/tdd",
      packageType: "hybrid",
    });

    expect(text).toContain("hybrid");
    expect(text).toMatch(/still in place/i);
  });

  it("states that an invalid record placed nothing at all", () => {
    expect(
      skippedEntryText({
        reason: "invalid-package",
        virtualPath: "skills/tdd",
        packageType: "invalid",
      }),
    ).toMatch(/placed no files/i);
  });

  it("says one entry could not be read, not that the lockfile is broken", () => {
    expect(
      skippedEntryText({ reason: "unreadable", virtualPath: "skills/local" }),
    ).toBe("Could not read the lockfile entry for skills/local.");
  });

  it("falls back to an unnamed entry when it has no virtual path", () => {
    expect(skippedEntryText({ reason: "unreadable", virtualPath: null })).toBe(
      "Could not read one lockfile entry.",
    );
  });
});

describe("skippedEntryKey", () => {
  it("keeps two unnamed entries apart", () => {
    const unnamed = { reason: "unreadable", virtualPath: null } as const;

    expect(skippedEntryKey(unnamed, 0)).not.toBe(skippedEntryKey(unnamed, 1));
  });
});

describe("skippedNeedsAttention", () => {
  it("is false for a primitive Maestro simply does not manage", () => {
    expect(
      skippedNeedsAttention({
        reason: "unsupported-type",
        virtualPath: "hooks/format",
        packageType: "claude_hook",
      }),
    ).toBe(false);
  });

  it("is true for a skill the user can recover", () => {
    expect(
      skippedNeedsAttention({
        reason: "unmanageable-skill",
        virtualPath: "skills/tdd",
        packageType: "marketplace_plugin",
      }),
    ).toBe(true);
  });
});
