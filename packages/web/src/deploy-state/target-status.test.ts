import { describe, expect, it } from "vitest";
import { TARGET_STATUS_WORDS, targetStatus } from "./target-status";

const words = (value: ReturnType<typeof targetStatus>) =>
  value === null ? null : `${value.glyph} ${value.word}`;

describe("targetStatus", () => {
  it("reads an unfinished operation as its notice's heading, ahead of everything", () => {
    for (const [pending, heading] of [
      ["deploy", "⚠ Deploy incomplete"],
      ["remove", "⚠ Removal incomplete"],
      ["update", "⚠ Update incomplete"],
    ] as const) {
      const status = targetStatus({
        indicator: "ok",
        behind: true,
        pinnedPerSkill: true,
        localEdits: true,
        pending,
      });
      expect(words(status)).toBe(heading);
      expect(status?.family).toBe("attention");
    }
  });

  it("reads a target pinned per skill as a neutral fact over any drift", () => {
    const status = targetStatus({ indicator: "drift", pinnedPerSkill: true });
    expect(words(status)).toBe("• Pinned per skill");
    expect(status?.family).toBe("neutral");
  });

  it("reads a target whose release lags as Behind, never In sync", () => {
    expect(words(targetStatus({ indicator: "ok", behind: true }))).toBe(
      "↑ Behind",
    );
    expect(words(targetStatus({ indicator: "drift" }))).toBe("↑ Behind");
    expect(words(targetStatus({ indicator: "ok" }))).toBe("✓ In sync");
  });

  it("reads a record that needs the reader as Attention", () => {
    expect(words(targetStatus({ indicator: "attention", behind: true }))).toBe(
      "⚠ Attention",
    );
  });

  it("reads an empty target and a foreign one as neutral facts", () => {
    expect(words(targetStatus({ indicator: "empty" }))).toBe("– Empty");
    expect(words(targetStatus({ indicator: "foreign" }))).toBe(
      "• Other origin",
    );
  });

  it("reads a check that could not answer as ?, and a running one as nothing", () => {
    expect(words(targetStatus({ indicator: "unknown" }))).toBe("? Unknown");
    expect(words(targetStatus({ indicator: "unverified" }))).toBe("? Unknown");
    expect(targetStatus({ indicator: "pending" })).toBeNull();
  });

  it("reads a target holding a local edit as Local edits over Behind, In sync and Pinned per skill", () => {
    for (const status of [
      targetStatus({ indicator: "ok", localEdits: true }),
      targetStatus({ indicator: "ok", behind: true, localEdits: true }),
      targetStatus({ indicator: "drift", localEdits: true }),
      targetStatus({ indicator: "ok", pinnedPerSkill: true, localEdits: true }),
    ]) {
      expect(words(status)).toBe("✎ Local edits");
      expect(status?.family).toBe("attention");
    }
  });

  it("lets Attention outrank Local edits", () => {
    expect(
      words(targetStatus({ indicator: "attention", localEdits: true })),
    ).toBe("⚠ Attention");
    expect(
      words(
        targetStatus({
          indicator: "attention",
          pinnedPerSkill: true,
          localEdits: true,
        }),
      ),
    ).toBe("⚠ Attention");
  });

  it("shows no Local edits before the drift check has answered", () => {
    expect(targetStatus({ indicator: "pending", localEdits: true })).toBeNull();
  });

  it("offers every badge word to the Filter, worst first", () => {
    expect(TARGET_STATUS_WORDS).toEqual([
      "Deploy incomplete",
      "Removal incomplete",
      "Update incomplete",
      "Attention",
      "Local edits",
      "Behind",
      "Unknown",
      "In sync",
      "Pinned per skill",
      "Other origin",
      "Empty",
    ]);
  });
});
