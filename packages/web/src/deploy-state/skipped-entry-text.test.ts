import { describe, expect, it } from "vitest";
import { skippedEntryKey, skippedEntryText } from "./skipped-entry-text";

describe("skippedEntryText", () => {
  it("names the unsupported type of a skipped entry", () => {
    expect(
      skippedEntryText({
        reason: "unsupported-type",
        virtualPath: "hooks/format",
        packageType: "claude_hook",
      }),
    ).toBe("Skipped hooks/format (unsupported type claude_hook).");
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
