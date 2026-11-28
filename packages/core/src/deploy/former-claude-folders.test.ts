import { describe, expect, it } from "vitest";
import { formerClaudeProfiles } from "./former-claude-folders";
import { DEFAULT_GLOBAL_LAYOUT } from "./global-layout.fake";

const HOME = "/home/me";
const MOVED = {
  ...DEFAULT_GLOBAL_LAYOUT,
  roots: { ...DEFAULT_GLOBAL_LAYOUT.roots, claude: ".claude-work" },
};
const row = (value: string) => ({ target: "claude", value });

describe("formerClaudeProfiles", () => {
  it("gives a former folder that resolves outside HOME no profile", () => {
    expect(
      formerClaudeProfiles({
        deployments: [
          row(".claude/skills/tdd/SKILL.md"),
          row(".claude-old/skills/tdd/SKILL.md"),
        ],
        layout: MOVED,
        home: HOME,
        realpath: (path) =>
          path === `${HOME}/.claude-old` ? "/elsewhere/claude" : path,
      }),
    ).toEqual([{ configDir: null }]);
  });

  it("names the variable's folder by its path under HOME", () => {
    expect(
      formerClaudeProfiles({
        deployments: [row(".claude-work/skills/tdd/SKILL.md")],
        layout: DEFAULT_GLOBAL_LAYOUT,
        home: HOME,
        realpath: (path) => path,
      }),
    ).toEqual([{ configDir: `${HOME}/.claude-work` }]);
  });
});
