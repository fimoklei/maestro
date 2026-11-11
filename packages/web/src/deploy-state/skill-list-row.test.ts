import type { DeployedPrimitive, GlobalFolderState } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import { globalSkillReadings } from "./global-skill-readings";
import { globalSkillRows, repoSkillRows } from "./skill-list-row";

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

const drift = driftViewModel({
  data: {
    behind: [
      { name: "jobs", current: "v0.4.1", latest: "v0.4.3", reading: "behind" },
    ],
  },
  isError: false,
});

describe("skill list rows", () => {
  it("ranks each row by the skill-row order and marks only Up to date clean", () => {
    const skills = [
      copy("tdd"),
      copy("jobs"),
      copy("grill", "unverified"),
      copy("show-me"),
      copy("ship"),
      copy("commit", "local-edits"),
      copy("held", "edits-in-harness"),
    ];
    const folders = [
      folder("~/.claude/skills", { primitives: skills }),
      folder("~/.agents/skills", {
        primitives: skills.filter((each) => each.name !== "show-me"),
        missing: ["show-me"],
        notUpdated: [{ name: "ship", stillAt: "v0.4.0" }],
      }),
    ];
    const rows = globalSkillRows(
      skills,
      drift,
      globalSkillReadings(
        skills.map((each) => each.name),
        folders,
        "v0.4.1",
      ),
    );

    expect(
      rows.map((row) => [
        row.primitive.name,
        row.mark?.word,
        row.rank,
        row.clean,
      ]),
    ).toEqual([
      ["tdd", "Up to date", 8, true],
      ["jobs", "Behind", 7, false],
      ["grill", "Unverified", 3, false],
      ["show-me", "Missing", 1, false],
      ["ship", "Not updated", 2, false],
      ["commit", "Local edits", 0, false],
      ["held", "Edits in the Harness", 6, false],
    ]);
  });

  it("ranks a row with no reading yet after every reading", () => {
    const [row] = repoSkillRows(
      [copy("tdd")],
      driftViewModel({ data: undefined, isError: false }),
    );

    expect(row?.mark).toBeNull();
    expect(row?.rank).toBe(9);
    expect(row?.clean).toBe(false);
  });
});
