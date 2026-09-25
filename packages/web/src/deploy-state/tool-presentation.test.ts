import { describe, expect, it } from "vitest";
import { toolPresentation } from "./tool-presentation";

describe("toolPresentation", () => {
  it("names Claude Code with its global skills destination", () => {
    expect(toolPresentation("claude")).toEqual({
      label: "Claude Code",
      destination: "~/.claude/skills",
    });
  });

  it("names Codex with its cross-client agent-skills destination", () => {
    // apm materializes a codex skill under the shared .agents dir, not .codex.
    expect(toolPresentation("codex")).toEqual({
      label: "Codex",
      destination: "~/.agents/skills",
    });
  });

  it("falls back to the raw token for an unknown tool, never hiding it", () => {
    expect(toolPresentation("aider")).toEqual({
      label: "aider",
      destination: "",
    });
  });
});
