import type { RemoveOutcome } from "@maestro/core";
import { describe, expect, it } from "vitest";
import {
  removeLedgerLeadIn,
  removeLedgerRows,
  removeOutcomeReport,
} from "./remove-ledger-rows";
import type {
  RemoveCheckState,
  RemoveRowWarning,
} from "./remove-preflight-view";

const leftoverCodex = [
  { tool: "codex" as const, path: "/Users/me/.agents/skills/tdd" },
];

const RUNNING: RemoveCheckState = { kind: "unanswered", warning: "checking" };

const perTool = (
  warnings: Record<string, RemoveRowWarning>,
): RemoveCheckState => ({ kind: "per-tool", warnings });

describe("removeLedgerRows", () => {
  it("states the repo path as the only row", () => {
    expect(
      removeLedgerRows(
        { kind: "repo", repoPath: "/Users/me/project" },
        [],
        RUNNING,
      ),
    ).toEqual([
      {
        key: "target:…/me/project",
        name: "…/me/project",
        path: null,
        status: null,
        drift: false,
        leftover: false,
      },
    ]);
  });

  it("keeps the detected tools in the order it was handed them", () => {
    expect(
      removeLedgerRows(
        { kind: "global", tools: ["codex", "claude"] },
        [],
        RUNNING,
      ).map((row) => row.name),
    ).toEqual(["Codex", "Claude Code"]);
  });

  it("puts a leftover copy after every detected tool", () => {
    const rows = removeLedgerRows(
      { kind: "global", tools: ["claude"] },
      leftoverCodex,
      RUNNING,
    );

    expect(rows.map((row) => row.name)).toEqual(["Claude Code", "Codex"]);
  });

  it("carries the leftover's path and status on its own row", () => {
    const [leftover] = removeLedgerRows(
      { kind: "global", tools: [] },
      leftoverCodex,
      RUNNING,
    );

    expect(leftover).toEqual({
      key: "leftover:codex",
      name: "Codex",
      path: "/Users/me/.agents/skills/tdd",
      status: "Not installed — copy deleted in full",
      drift: true,
      leftover: true,
    });
  });

  describe("what the check says about a detected tool", () => {
    const rowsFor = (check: RemoveCheckState) =>
      removeLedgerRows(
        { kind: "global", tools: ["claude", "codex"] },
        [],
        check,
      );

    it("says nothing on a row while the check is still running", () => {
      for (const row of rowsFor(RUNNING)) {
        expect(row.status).toBeNull();
        expect(row.drift).toBe(false);
      }
    });

    it("says nothing on a row the check came back clean about", () => {
      const [claude] = rowsFor(perTool({ claude: "none", codex: "none" }));

      expect(claude?.status).toBeNull();
      expect(claude?.drift).toBe(false);
    });

    it("marks only the tool whose copy carries a cost", () => {
      const [claude, codex] = rowsFor(
        perTool({ claude: "none", codex: "cannot-verify" }),
      );

      expect(claude?.status).toBeNull();
      expect(claude?.drift).toBe(false);
      expect(codex?.status).toBe("Nothing recorded — may lose work");
      expect(codex?.drift).toBe(true);
    });

    it("keeps a missing baseline apart from a check that never ran", () => {
      const [claude, codex] = rowsFor(
        perTool({ claude: "cannot-verify", codex: "none" }),
      );

      expect(claude?.status).toBe("Nothing recorded — may lose work");
      expect(claude?.drift).toBe(true);
      expect(codex?.status).toBeNull();
    });

    it("never reads a tool the answer left out as a clean copy", () => {
      const [, codex] = rowsFor(perTool({ claude: "none" }));

      expect(codex?.status).toBe("Check did not run — may lose work");
      expect(codex?.drift).toBe(true);
    });

    it("states a failed request on every row, because it answered for none", () => {
      for (const row of rowsFor({
        kind: "unanswered",
        warning: "check-failed",
      })) {
        expect(row.status).toBe("Check did not run — may lose work");
        expect(row.drift).toBe(true);
      }
    });
  });

  describe("what the check says about a leftover copy", () => {
    const leftoverRow = (check: RemoveCheckState) =>
      removeLedgerRows(
        { kind: "global", tools: ["claude"] },
        [{ tool: "codex" as const, path: "/Users/me/.agents/skills/tdd" }],
        check,
      )[1];

    it("names the cost it would delete with the copy", () => {
      expect(
        leftoverRow(perTool({ claude: "none", codex: "cannot-verify" }))
          ?.status,
      ).toBe("Not installed — nothing recorded to check");
    });

    it("keeps a copy with no baseline apart from a checked one", () => {
      expect(
        leftoverRow(perTool({ claude: "none", codex: "cannot-verify" }))
          ?.status,
      ).toBe("Not installed — nothing recorded to check");
    });

    it("never reads a leftover the answer left out as a checked copy", () => {
      expect(leftoverRow(perTool({ claude: "none" }))?.status).toBe(
        "Not installed — check did not run",
      );
    });

    it("states the plain reclaim when the copy came back clean", () => {
      expect(
        leftoverRow(perTool({ claude: "none", codex: "none" }))?.status,
      ).toBe("Not installed — copy deleted in full");
    });

    it("stays a cost whatever the check found", () => {
      for (const warning of [
        "none",
        "cannot-verify",
        "check-failed",
      ] as const) {
        expect(leftoverRow(perTool({ codex: warning }))?.drift).toBe(true);
      }
    });
  });

  describe("removeOutcomeReport, what the server proved after a failed removal", () => {
    const globalOutcome: RemoveOutcome = {
      scope: "global",
      tools: [
        { tool: "claude", state: "removed" },
        { tool: "codex", state: "not-removed" },
      ],
    };
    const namesIn = (
      report: ReturnType<typeof removeOutcomeReport>,
      label: string,
    ) =>
      report.groups
        .find((group) => group.label === label)
        ?.rows.map((row) => row.name);

    it("groups each detected tool under its proven outcome", () => {
      const report = removeOutcomeReport(
        { kind: "global", tools: ["claude", "codex"] },
        globalOutcome,
      );

      expect(report.groups.map((group) => [group.tone, group.label])).toEqual([
        ["failed", "Not removed"],
        ["attention", "Outcome unknown"],
        ["good", "Removed"],
      ]);
      expect(namesIn(report, "Removed")).toEqual(["Claude Code"]);
      expect(namesIn(report, "Not removed")).toEqual(["Codex"]);
    });

    it("keeps the order the ledger showed before the user confirmed", () => {
      const report = removeOutcomeReport(
        { kind: "global", tools: ["codex", "claude"] },
        {
          scope: "global",
          tools: [
            { tool: "claude", state: "removed" },
            { tool: "codex", state: "removed" },
          ],
        },
      );

      expect(namesIn(report, "Removed")).toEqual(["Codex", "Claude Code"]);
    });

    it("draws a row for a target only the report names", () => {
      const report = removeOutcomeReport(
        { kind: "global", tools: ["claude"] },
        globalOutcome,
      );

      expect(namesIn(report, "Not removed")).toEqual(["Codex"]);
    });

    it("drops a target the report left out, rather than drawing it blank", () => {
      const report = removeOutcomeReport(
        { kind: "global", tools: ["claude", "codex", "cursor"] },
        globalOutcome,
      );

      expect(report.groups.flatMap((group) => group.rows)).toHaveLength(2);
    });

    it("never reads an unproven target as removed", () => {
      const report = removeOutcomeReport(
        { kind: "repo", repoPath: "/Users/me/project" },
        { scope: "repo", state: "unknown" },
      );

      expect(namesIn(report, "Outcome unknown")).toEqual(["…/me/project"]);
      expect(namesIn(report, "Removed")).toEqual([]);
    });

    it("names the repository as the table does, never in mono", () => {
      const report = removeOutcomeReport(
        { kind: "repo", repoPath: "/Users/me/project" },
        { scope: "repo", state: "not-removed" },
      );

      expect(report.groups[0]?.rows[0]).toEqual({ name: "…/me/project" });
    });

    it("counts the targets the removal came off in its heading", () => {
      expect(
        removeOutcomeReport(
          { kind: "global", tools: ["claude", "codex"] },
          globalOutcome,
        ).heading,
      ).toBe("Removed from 1 of 2 targets");
    });

    it("counts an unproven target as one the removal did not come off", () => {
      expect(
        removeOutcomeReport(
          { kind: "global", tools: ["claude", "codex"] },
          {
            scope: "global",
            tools: [
              { tool: "claude", state: "unknown" },
              { tool: "codex", state: "unknown" },
            ],
          },
        ).heading,
      ).toBe("Removed from 0 of 2 targets");
    });

    it("speaks of one target in the singular", () => {
      expect(
        removeOutcomeReport(
          { kind: "repo", repoPath: "/Users/me/project" },
          { scope: "repo", state: "removed" },
        ).heading,
      ).toBe("Removed from 1 of 1 target");
    });
  });

  describe("removeLedgerLeadIn", () => {
    it("asks the question while nothing has been attempted", () => {
      expect(removeLedgerLeadIn("skill")).toBe("Removes the skill from:");
    });

    it("names the type being removed, not the category it belongs to", () => {
      expect(removeLedgerLeadIn("mcp")).toBe("Removes the MCP server from:");
    });
  });

  it("puts the repo scope's aggregate answer on its single row", () => {
    const [repo] = removeLedgerRows(
      { kind: "repo", repoPath: "/Users/me/project" },
      [],
      { kind: "repo", warning: "cannot-verify" },
    );

    expect(repo?.status).toBe("Nothing recorded — may lose work");
    expect(repo?.drift).toBe(true);
  });
});
