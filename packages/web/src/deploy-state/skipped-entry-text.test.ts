import { describe, expect, it } from "vitest";
import { FIX_AND_RELEASE } from "./notice-copy";
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
      "hooks/format is deployed as claude_hook, which Maestro does not manage. Its files are still there.",
    );
  });

  it("names the recorded type of an unsupported deployment and says the files stay", () => {
    const text = skippedEntryText({
      reason: "unmanageable-skill",
      virtualPath: "skills/tdd",
      packageType: "hybrid",
    });

    expect(text).toContain("hybrid");
    // One string, one place: the deploy refusal for the same state says this.
    expect(text).toContain(FIX_AND_RELEASE);
  });

  it("states that a failed deployment landed nothing at all", () => {
    expect(
      skippedEntryText({
        reason: "invalid-package",
        virtualPath: "skills/tdd",
        packageType: "invalid",
      }),
    ).toBe(`The deploy of skills/tdd landed no files. ${FIX_AND_RELEASE}`);
  });

  it("says one entry could not be read, not that the record is broken", () => {
    expect(
      skippedEntryText({ reason: "unreadable", virtualPath: "skills/local" }),
    ).toBe("The deployment record's entry for skills/local could not be read.");
  });

  it("falls back to an unnamed entry when it has no virtual path", () => {
    expect(skippedEntryText({ reason: "unreadable", virtualPath: null })).toBe(
      "One entry in the deployment record could not be read.",
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
