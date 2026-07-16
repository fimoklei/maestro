import { describe, expect, it } from "vitest";
import { toolDisplayName } from "./tool-labels";

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
