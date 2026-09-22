import { describe, expect, it } from "vitest";
import { targetStatus } from "./target-status";

const words = (value: ReturnType<typeof targetStatus>) =>
  value === null ? null : `${value.glyph} ${value.word}`;

describe("targetStatus", () => {
  it("reads a half-landed update as Mixed releases ahead of everything", () => {
    expect(
      words(
        targetStatus({
          indicator: "ok",
          behind: true,
          pinnedPerSkill: true,
          mixedReleases: true,
        }),
      ),
    ).toBe("⚠ Mixed releases");
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
});
