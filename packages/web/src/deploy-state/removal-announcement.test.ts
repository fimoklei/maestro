import { describe, expect, it } from "vitest";
import { removalAnnouncement } from "./removal-announcement";

describe("announcing a removal that landed", () => {
  it("names the skill, the version that went, and the repo", () => {
    expect(
      removalAnnouncement({
        name: "tdd",
        version: "v0.5.0",
        target: { kind: "repo", repoPath: "/Users/me/project" },
      }),
    ).toBe("removed tdd v0.5.0 from /Users/me/project");
  });

  it("names the whole detected set on a global removal", () => {
    expect(
      removalAnnouncement({
        name: "tdd",
        version: "v0.5.0",
        target: { kind: "global", tools: ["claude", "codex"] },
      }),
    ).toBe("removed tdd v0.5.0 from Claude Code and Codex");
  });

  // The tool set is read server-side and can be empty by the time the removal
  // lands. An unnamed scope still beats a sentence that trails off.
  it("falls back to the scope the confirmation named when no tool is known", () => {
    expect(
      removalAnnouncement({
        name: "tdd",
        version: "v0.5.0",
        target: { kind: "global", tools: [] },
      }),
    ).toBe("removed tdd v0.5.0 from every detected tool");
  });
});
