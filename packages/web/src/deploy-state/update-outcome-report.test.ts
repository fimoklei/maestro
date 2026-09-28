import type { UpdateOutcomeRow } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { updateOutcomeReport } from "./update-outcome-report";

const RELEASES = { from: "v0.3.2", to: "v0.3.4" };

const report = (rows: UpdateOutcomeRow[], retry = true) =>
  updateOutcomeReport({ rows, releases: RELEASES, retry });

describe("update outcome report", () => {
  it("groups a clean update by what landed", () => {
    expect(
      report([
        { name: "tdd", tool: null, state: "updated" },
        { name: "review", tool: null, state: "removed" },
      ]),
    ).toStrictEqual({
      heading: "Updated to v0.3.4",
      groups: [
        { tone: "failed", label: "Failed", rows: [] },
        { tone: "attention", label: "Attention", rows: [] },
        {
          tone: "good",
          label: "Updated",
          rows: [{ name: "tdd", detail: "v0.3.4" }],
        },
        { tone: "good", label: "Removed", rows: [{ name: "review" }] },
      ],
    });
  });

  it("states the cause and the next step of each failure", () => {
    const { heading, groups } = report([
      { name: "grill", tool: null, state: "not-updated" },
      { name: "tdd", tool: null, state: "missing" },
      { name: "review", tool: null, state: "not-removed" },
      { name: "spec", tool: null, state: "unknown" },
    ]);

    expect(heading).toBe("Not every skill reached v0.3.4");
    expect(groups[0]?.rows).toStrictEqual([
      {
        name: "grill",
        detail:
          "Still at v0.3.2. Select Retry update to run the same release again.",
      },
      {
        name: "tdd",
        detail:
          "Not deployed. Select Retry update to run the same release again.",
      },
      {
        name: "review",
        detail:
          "Still deployed, though v0.3.4 drops it. Select Retry update to run the same release again.",
      },
    ]);
    expect(groups[1]?.rows).toStrictEqual([
      {
        name: "spec",
        detail:
          "Maestro could not read this skill back. Check its state on the Deploy-state screen.",
      },
    ]);
  });

  it("claims no failure where a skill could only not be read back", () => {
    expect(
      report([
        { name: "tdd", tool: null, state: "updated" },
        { name: "spec", tool: null, state: "unknown" },
      ]).heading,
    ).toBe("Maestro could not confirm every skill reached v0.3.4");
  });

  it("sends the reader to the Deploy-state screen where no retry is offered", () => {
    const { groups } = report(
      [{ name: "grill", tool: null, state: "not-updated" }],
      false,
    );

    expect(groups[0]?.rows[0]?.detail).toBe(
      "Still at v0.3.2. Check the target on the Deploy-state screen, then select Update target again.",
    );
  });

  it("states a skill once where every tool agrees", () => {
    const { groups } = report([
      { name: "tdd", tool: "claude", state: "updated" },
      { name: "tdd", tool: "codex", state: "updated" },
    ]);

    expect(groups[2]?.rows).toStrictEqual([{ name: "tdd", detail: "v0.3.4" }]);
  });

  it("names the tool on each row where the tools disagree", () => {
    const { groups } = report([
      { name: "grill", tool: "claude", state: "updated" },
      { name: "grill", tool: "codex", state: "not-updated" },
    ]);

    expect(groups[0]?.rows.map((row) => row.name)).toStrictEqual([
      "grill in Codex",
    ]);
    expect(groups[2]?.rows.map((row) => row.name)).toStrictEqual([
      "grill in Claude Code",
    ]);
  });
});
