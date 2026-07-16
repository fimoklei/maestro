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

  it("says no tools detected for an empty set", () => {
    expect(globalOptionLabel([])).toBe("Global (no tools detected)");
  });

  it("falls back to plain Global while the tool set is unknown", () => {
    // Loading or an unreadable global deploy-state: never claim a tool set we
    // cannot prove (mirrors J03's honest-empty rule).
    expect(globalOptionLabel(undefined)).toBe("Global");
  });
});
