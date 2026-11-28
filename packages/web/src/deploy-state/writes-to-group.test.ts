import { describe, expect, it } from "vitest";
import { writesToGroup } from "./writes-to-group";

describe("writesToGroup", () => {
  it("leaves out a former Claude Code folder, which no write reaches", () => {
    expect(
      writesToGroup([
        { path: "~/.claude-work/skills", tool: "claude", detected: true },
        { path: "~/.agents/skills", tool: "codex", detected: false },
        {
          path: "~/.claude/skills",
          tool: "claude",
          detected: false,
          former: true,
        },
      ]).rows.map((row) => [row.name, row.sentence ?? null]),
    ).toEqual([
      ["~/.claude-work/skills", null],
      ["~/.agents/skills", "Codex not detected · not written"],
    ]);
  });
});
