import type { DeployedPrimitive, GlobalFolderState } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { globalSkillReadings } from "./global-skill-readings";

const copy = (
  name: string,
  state?: DeployedPrimitive["copy"],
): DeployedPrimitive => ({
  type: "skill",
  name,
  version: "v0.4.1",
  ...(state ? { copy: state } : {}),
});

const folder = (
  path: string,
  facts: Partial<GlobalFolderState>,
): GlobalFolderState => ({
  path,
  tool: path === "~/.claude/skills" ? "claude" : "codex",
  detected: true,
  primitives: [],
  ...facts,
});

const SKILLS = ["workflow-commit", "workflow-ship", "show-me", "tdd"];

describe("globalSkillReadings", () => {
  it("reads each skill in each written folder", () => {
    const { readings } = globalSkillReadings(
      SKILLS,
      [
        folder("~/.claude/skills", {
          primitives: [
            copy("workflow-commit", "local-edits"),
            copy("workflow-ship"),
            copy("show-me"),
            copy("tdd"),
          ],
        }),
        folder("~/.agents/skills", {
          primitives: [
            copy("workflow-commit"),
            copy("workflow-ship", "local-edits"),
            copy("tdd"),
          ],
          missing: ["show-me"],
          notUpdated: [{ name: "tdd", stillAt: "v0.4.0" }],
        }),
      ],
      "v0.4.1",
    );

    expect(
      readings.map(({ skill, folder, reading }) => [skill, folder, reading]),
    ).toEqual([
      ["workflow-commit", "~/.claude/skills", "local-edits"],
      ["workflow-commit", "~/.agents/skills", null],
      ["workflow-ship", "~/.claude/skills", null],
      ["workflow-ship", "~/.agents/skills", "local-edits"],
      ["show-me", "~/.claude/skills", null],
      ["show-me", "~/.agents/skills", "missing"],
      ["tdd", "~/.claude/skills", null],
      ["tdd", "~/.agents/skills", "not-updated"],
    ]);
  });

  it("counts each folder's skills per reading", () => {
    const { folders } = globalSkillReadings(
      SKILLS,
      [
        folder("~/.claude/skills", {
          primitives: SKILLS.map((name) => copy(name)),
        }),
        folder("~/.agents/skills", {
          primitives: [
            copy("workflow-commit", "local-edits"),
            copy("workflow-ship", "local-edits"),
            copy("tdd"),
          ],
          missing: ["show-me"],
          notUpdated: [{ name: "tdd", stillAt: null }],
        }),
      ],
      "v0.4.1",
    );

    expect(folders).toEqual([
      {
        path: "~/.claude/skills",
        counts: { missing: 0, notUpdated: 0, localEdits: 0 },
      },
      {
        path: "~/.agents/skills",
        counts: { missing: 1, notUpdated: 1, localEdits: 2 },
      },
    ]);
  });

  it("keeps a folder whose tool is not detected out of every reading", () => {
    const { readings, folders } = globalSkillReadings(
      ["tdd"],
      [
        folder("~/.claude/skills", { primitives: [copy("tdd")] }),
        folder("~/.agents/skills", {
          detected: false,
          primitives: [copy("tdd", "local-edits")],
          missing: ["tdd"],
          strayCopies: [{ name: "tdd", atRelease: false }],
        }),
      ],
      "v0.4.1",
    );

    expect(readings.map((each) => each.folder)).toEqual(["~/.claude/skills"]);
    expect(folders.map((each) => each.path)).toEqual(["~/.claude/skills"]);
  });
});
