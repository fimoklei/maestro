import { describe, expect, it } from "vitest";
import { removalAnnouncement } from "./removal-announcement";

describe("announcing a removal that landed", () => {
  // Named as the table names it: a full path wraps the toast over lines (#1119).
  it("names the skill, the version that went, and the repo by its label", () => {
    expect(
      removalAnnouncement({
        name: "tdd",
        version: "v0.5.0",
        target: { kind: "repo", name: "…/me/project" },
      }),
    ).toBe("Removed tdd v0.5.0 from …/me/project.");
  });

  it("keeps a long repo label whole", () => {
    expect(
      removalAnnouncement({
        name: "test-driven-development",
        version: "v12.40.3",
        target: {
          kind: "repo",
          name: "…/client-work/a-repository-with-a-very-long-name",
        },
      }),
    ).toBe(
      "Removed test-driven-development v12.40.3 from …/client-work/a-repository-with-a-very-long-name.",
    );
  });

  it("names the whole detected set on a global removal", () => {
    expect(
      removalAnnouncement({
        name: "tdd",
        version: "v0.5.0",
        target: { kind: "global", tools: ["claude", "codex"] },
      }),
    ).toBe("Removed tdd v0.5.0 from Claude Code and Codex.");
  });

  // The server owns both the version and the scope. A response without a
  // version is a server the cockpit does not match — saying so beats printing
  // the word "undefined" over an irreversible action.
  it("says the version is unknown rather than inventing one", () => {
    expect(
      removalAnnouncement({
        name: "tdd",
        version: undefined,
        target: { kind: "repo", name: "…/me/project" },
      }),
    ).toBe("Removed tdd (version unknown) from …/me/project.");
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
    ).toBe("Removed tdd v0.5.0 from every detected tool.");
  });
});
