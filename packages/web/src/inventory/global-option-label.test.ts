import { describe, expect, it } from "vitest";
import { globalOptionLabel } from "./global-option-label";

describe("globalOptionLabel", () => {
  it("names both detected tools", () => {
    expect(globalOptionLabel(["claude", "codex"])).toBe(
      "Global (Claude Code + Codex)",
    );
  });

  it("names a single detected tool", () => {
    expect(globalOptionLabel(["claude"])).toBe("Global (Claude Code)");
  });

  it("says no tool detected for an empty set", () => {
    expect(globalOptionLabel([])).toBe("Global (no tool detected)");
  });

  it("falls back to plain Global while the tool set is unknown", () => {
    // Loading or unreadable: never claim a tool set we cannot prove.
    expect(globalOptionLabel(undefined)).toBe("Global");
  });
});
