import type { RemoveOutcome } from "@maestro/core";
import { describe, expect, it } from "vitest";
import {
  type RemoveDialogTarget,
  removeLedgerLeadIn,
  removeLedgerRows,
  removeOutcomeReport,
  removeTitle,
} from "./remove-ledger-rows";
import type {
  RemoveCheckState,
  RemoveRowWarning,
} from "./remove-preflight-view";

type RemoveFolderAnswer = Extract<
  RemoveCheckState,
  { kind: "per-folder" }
>["folders"][number];

const RUNNING: RemoveCheckState = { kind: "unanswered", warning: "checking" };

const CLAUDE = "~/.claude/skills";
const AGENTS = "~/.agents/skills";
const GLOBAL: RemoveDialogTarget = {
  kind: "global",
  folders: [CLAUDE, AGENTS],
};

const answer = (
  tool: "claude" | "codex",
  warning: RemoveRowWarning,
  detected = true,
): RemoveFolderAnswer => ({
  tool,
  path: tool === "claude" ? CLAUDE : AGENTS,
  detected,
  warning,
});

const perFolder = (
  ...folders: readonly RemoveFolderAnswer[]
): RemoveCheckState => ({ kind: "per-folder", folders });

describe("removeLedgerRows", () => {
  it("states the repo path as the only row", () => {
    expect(
      removeLedgerRows(
        { kind: "repo", repoPath: "/Users/me/project", name: "…/me/project" },
        RUNNING,
      ),
    ).toEqual([
      {
        key: "target:…/me/project",
        name: "…/me/project",
        status: null,
        drift: false,
      },
    ]);
  });

  it("lists the Global folders by path, in the order it was handed them", () => {
    expect(
      removeLedgerRows({ kind: "global", folders: [AGENTS, CLAUDE] }, RUNNING),
    ).toEqual([
      expect.objectContaining({ name: AGENTS, folder: { muted: false } }),
      expect.objectContaining({ name: CLAUDE, folder: { muted: false } }),
    ]);
  });

  it("lists the folders the check answered for, an undetected one muted with its tool", () => {
    const rows = removeLedgerRows(
      { kind: "global", folders: [CLAUDE] },
      perFolder(answer("claude", "none"), answer("codex", "none", false)),
    );

    expect(rows.map((row) => [row.name, row.folder])).toEqual([
      [CLAUDE, { muted: false }],
      [AGENTS, { muted: true, note: "Codex not detected" }],
    ]);
  });

  describe("what the check says about a Global folder", () => {
    const rowsFor = (check: RemoveCheckState) =>
      removeLedgerRows(GLOBAL, check);

    it("says nothing on a row while the check is still running", () => {
      for (const row of rowsFor(RUNNING)) {
        expect(row.status).toBeNull();
        expect(row.drift).toBe(false);
      }
    });

    it("says nothing on a row the check came back clean about", () => {
      const [claude] = rowsFor(
        perFolder(answer("claude", "none"), answer("codex", "none")),
      );

      expect(claude?.status).toBeNull();
      expect(claude?.drift).toBe(false);
    });

    it("marks only the folder whose copy carries a cost", () => {
      const [claude, codex] = rowsFor(
        perFolder(answer("claude", "none"), answer("codex", "cannot-verify")),
      );

      expect(claude?.status).toBeNull();
      expect(claude?.drift).toBe(false);
      expect(codex?.status).toBe("Nothing recorded — may lose work");
      expect(codex?.drift).toBe(true);
    });

    it("keeps a missing baseline apart from a check that never ran", () => {
      const [claude, codex] = rowsFor(
        perFolder(answer("claude", "cannot-verify"), answer("codex", "none")),
      );

      expect(claude?.status).toBe("Nothing recorded — may lose work");
      expect(claude?.drift).toBe(true);
      expect(codex?.status).toBeNull();
    });

    it("never reads a folder the answer left out as a clean copy", () => {
      const [, codex] = rowsFor(perFolder(answer("claude", "none")));

      expect(codex?.name).toBe(AGENTS);
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

  describe("removeOutcomeReport, what the server proved after a failed removal", () => {
    const globalOutcome: RemoveOutcome = {
      scope: "global",
      tools: [
        { tool: "claude", path: CLAUDE, state: "removed" },
        { tool: "codex", path: AGENTS, state: "not-removed" },
      ],
    };
    const namesIn = (
      report: ReturnType<typeof removeOutcomeReport>,
      label: string,
    ) =>
      report.groups
        .find((group) => group.label === label)
        ?.rows.map((row) => row.name);

    it("groups each Global folder under its proven outcome, by path", () => {
      const report = removeOutcomeReport(GLOBAL, globalOutcome);

      expect(report.groups.map((group) => [group.tone, group.label])).toEqual([
        ["failed", "Not removed"],
        ["attention", "Outcome unknown"],
        ["good", "Removed"],
      ]);
      expect(namesIn(report, "Removed")).toEqual([CLAUDE]);
      expect(namesIn(report, "Not removed")).toEqual([AGENTS]);
    });

    it("keeps the order the ledger showed before the user confirmed", () => {
      const report = removeOutcomeReport(
        { kind: "global", folders: [AGENTS, CLAUDE] },
        {
          scope: "global",
          tools: [
            { tool: "claude", path: CLAUDE, state: "removed" },
            { tool: "codex", path: AGENTS, state: "removed" },
          ],
        },
      );

      expect(namesIn(report, "Removed")).toEqual([AGENTS, CLAUDE]);
    });

    it("draws a row for a folder only the report names", () => {
      const report = removeOutcomeReport(
        { kind: "global", folders: [CLAUDE] },
        globalOutcome,
      );

      expect(namesIn(report, "Not removed")).toEqual([AGENTS]);
    });

    it("drops a folder the report left out, rather than drawing it blank", () => {
      const report = removeOutcomeReport(
        { kind: "global", folders: [CLAUDE, AGENTS, "~/.cursor/skills"] },
        globalOutcome,
      );

      expect(report.groups.flatMap((group) => group.rows)).toHaveLength(2);
    });

    it("never reads an unproven target as removed", () => {
      const report = removeOutcomeReport(
        { kind: "repo", repoPath: "/Users/me/project", name: "…/me/project" },
        { scope: "repo", state: "unknown" },
      );

      expect(namesIn(report, "Outcome unknown")).toEqual(["…/me/project"]);
      expect(namesIn(report, "Removed")).toEqual([]);
    });

    it("names the repository as the table does, never in mono", () => {
      const report = removeOutcomeReport(
        { kind: "repo", repoPath: "/Users/me/project", name: "…/me/project" },
        { scope: "repo", state: "not-removed" },
      );

      expect(report.groups[0]?.rows[0]).toEqual({ name: "…/me/project" });
    });

    it("counts the folders the removal came off in its heading", () => {
      expect(removeOutcomeReport(GLOBAL, globalOutcome).heading).toBe(
        "Removed from 1 of 2 folders",
      );
    });

    it("counts an unproven folder as one the removal did not come off", () => {
      expect(
        removeOutcomeReport(GLOBAL, {
          scope: "global",
          tools: [
            { tool: "claude", path: CLAUDE, state: "unknown" },
            { tool: "codex", path: AGENTS, state: "unknown" },
          ],
        }).heading,
      ).toBe("Removed from 0 of 2 folders");
    });

    it("speaks of one folder in the singular", () => {
      expect(
        removeOutcomeReport(GLOBAL, {
          scope: "global",
          tools: [{ tool: "claude", path: CLAUDE, state: "removed" }],
        }).heading,
      ).toBe("Removed from 1 of 1 folder");
    });

    it("speaks of one target in the singular", () => {
      expect(
        removeOutcomeReport(
          { kind: "repo", repoPath: "/Users/me/project", name: "…/me/project" },
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
      { kind: "repo", repoPath: "/Users/me/project", name: "…/me/project" },
      { kind: "repo", warning: "cannot-verify" },
    );

    expect(repo?.status).toBe("Nothing recorded — may lose work");
    expect(repo?.drift).toBe(true);
  });
});

describe("removeTitle", () => {
  it("titles the Remove skill dialog with its verb and the skill's name", () => {
    expect(removeTitle("tdd")).toBe("Remove tdd");
  });
});
