import type { WriteReport } from "@maestro/core";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { type Copy, plainText } from "../ui/phrase";
import {
  type UpdateRow,
  updateFoldersReport,
  updateOutcomeReport,
} from "./update-outcome-report";

const RELEASES = { from: "v0.3.2", to: "v0.3.4" };

// A report row as read: its detail sentence in plain text.
const readRow = <R extends { detail?: Copy | ReactElement }>(row: R) =>
  row.detail === undefined || isValidElement(row.detail)
    ? row
    : { ...row, detail: plainText(row.detail) };

const report = (rows: UpdateRow[], retry = true) =>
  updateOutcomeReport({ rows, releases: RELEASES, retry });

describe("update outcome report", () => {
  // #1776: the dialog lists the release's own groups; no row claims Updated.
  it("states a clean update in its heading, with no row", () => {
    expect(
      report([
        { name: "tdd", tool: null, state: "written" },
        { name: "review", tool: null, state: "removed" },
      ]),
    ).toStrictEqual({
      heading: "Updated to v0.3.4",
      groups: [
        { tone: "failed", label: "Failed", rows: [] },
        { tone: "attention", label: "Attention", rows: [] },
      ],
    });
  });

  it("states the cause and the next step of each failure", () => {
    const { heading, groups } = report([
      { name: "grill", tool: null, state: "not-updated" },
      { name: "tdd", tool: null, state: "missing" },
      { name: "review", tool: null, state: "not-removed" },
      { name: "spec", tool: null, state: "not-confirmed" },
    ]);

    expect(heading).toBe("Not every skill reached v0.3.4");
    expect(groups[0]?.rows.map(readRow)).toStrictEqual([
      {
        name: "grill",
        detail: "Still at v0.3.2. Retry the update to run it again.",
      },
      {
        name: "tdd",
        detail: "Not deployed. Retry the update to run it again.",
      },
      {
        name: "review",
        detail:
          "Still deployed, though v0.3.4 drops it. Retry the update to run it again.",
      },
    ]);
    expect(groups[1]?.rows.map(readRow)).toStrictEqual([
      {
        name: "spec",
        detail:
          "Maestro couldn't read this skill back. Check its state on the Deploy-state screen.",
      },
    ]);
  });

  it("claims no failure where a skill could only not be read back", () => {
    expect(
      report([
        { name: "tdd", tool: null, state: "written" },
        { name: "spec", tool: null, state: "not-confirmed" },
      ]).heading,
    ).toBe("Maestro couldn't confirm every skill reached v0.3.4");
  });

  it("sends the reader to the Deploy-state screen where no retry is offered", () => {
    const { groups } = report(
      [{ name: "grill", tool: null, state: "not-updated" }],
      false,
    );

    expect(groups[0]?.rows.map(readRow)[0]?.detail).toBe(
      "Still at v0.3.2. Check the target on the Deploy-state screen, then select Update target again.",
    );
  });

  it("states a skill once where every tool agrees", () => {
    const { groups } = report([
      { name: "tdd", tool: "claude", state: "missing" },
      { name: "tdd", tool: "codex", state: "missing" },
    ]);

    expect(groups[0]?.rows.map((row) => row.name)).toStrictEqual(["tdd"]);
  });

  it("names the tool on each row where the tools disagree", () => {
    const { groups } = report([
      { name: "grill", tool: "claude", state: "written" },
      { name: "grill", tool: "codex", state: "not-updated" },
    ]);

    expect(groups[0]?.rows.map((row) => row.name)).toStrictEqual([
      "grill in Codex",
    ]);
  });
});

describe("Global update outcome report", () => {
  const everyFolderAt = {
    release: "v0.3.4",
    places: [
      {
        tool: "claude",
        path: "~/.claude/skills",
        detected: true,
        skills: [{ name: "tdd", state: "written" }],
      },
    ],
  } satisfies WriteReport;

  it("states a finished update in its heading", () => {
    expect(
      updateFoldersReport({ report: everyFolderAt, retry: false }).heading,
    ).toBe("Updated to v0.3.4");
  });

  it("claims no success while the update is incomplete, though every folder reads at the release", () => {
    expect(
      updateFoldersReport({ report: everyFolderAt, retry: true }).heading,
    ).toBe("Update incomplete");
  });
});
