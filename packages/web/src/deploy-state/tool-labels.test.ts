import { describe, expect, it } from "vitest";
import { toolDisplayName, toolNameList } from "./tool-labels";

describe("toolDisplayName", () => {
  it("names the claude token Claude Code", () => {
    expect(toolDisplayName("claude")).toBe("Claude Code");
  });

  it("names the codex token Codex", () => {
    expect(toolDisplayName("codex")).toBe("Codex");
  });

  it("falls back to the raw token for an unknown tool", () => {
    expect(toolDisplayName("gemini")).toBe("gemini");
  });
});

// A scope line has to read as a sentence, so the tools it names are joined the
// way a person would say them.
describe("toolNameList", () => {
  it("joins two tools with and", () => {
    expect(toolNameList(["claude", "codex"])).toBe("Claude Code and Codex");
  });

  it("names a single tool on its own", () => {
    expect(toolNameList(["claude"])).toBe("Claude Code");
  });

  it("separates three or more with commas before the last and", () => {
    expect(toolNameList(["claude", "codex", "gemini"])).toBe(
      "Claude Code, Codex and gemini",
    );
  });
});
