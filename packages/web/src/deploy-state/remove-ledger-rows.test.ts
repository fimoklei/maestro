import type { RemoveOutcome } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { removeLedgerLeadIn, removeLedgerRows } from "./remove-ledger-rows";
import type { RemoveCheckState } from "./remove-preflight-view";

const leftoverCodex = [
  { tool: "codex" as const, path: "/Users/me/.agents/skills/tdd" },
];

// The check while it is still running: it has made no claim about any row.
const RUNNING: RemoveCheckState = { kind: "unanswered", warning: "checking" };

const perTool = (
  warnings: Record<string, "none" | "local-edits" | "cannot-verify">,
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
        key: "target:/Users/me/project",
        name: "/Users/me/project",
        path: null,
        status: null,
        drift: false,
        leftover: false,
        outcome: null,
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
      status: "not installed — copy deleted in full",
      drift: true,
      leftover: true,
      outcome: null,
    });
  });

  // The cost belongs on the row that carries it, so the panel needs no block
  // underneath saying which target the sentence was about (#414).
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

    it("marks only the tool whose copy carries edits", () => {
      const [claude, codex] = rowsFor(
        perTool({ claude: "none", codex: "local-edits" }),
      );

      expect(claude?.status).toBeNull();
      expect(claude?.drift).toBe(false);
      expect(codex?.status).toBe("local edits — deleted too");
      expect(codex?.drift).toBe(true);
    });

    it("keeps a missing baseline apart from a check that never ran", () => {
      const [claude, codex] = rowsFor(
        perTool({ claude: "cannot-verify", codex: "none" }),
      );

      expect(claude?.status).toBe("nothing recorded — may lose work");
      expect(claude?.drift).toBe(true);
      expect(codex?.status).toBeNull();
    });

    it("never reads a tool the answer left out as a clean copy", () => {
      // The card detected two tools and the check reported on one. The tool
      // nobody answered for is unchecked, which is not the same as clean (J04).
      const [, codex] = rowsFor(perTool({ claude: "none" }));

      expect(codex?.status).toBe("check didn't run — may lose work");
      expect(codex?.drift).toBe(true);
    });

    it("states a failed request on every row, because it answered for none", () => {
      for (const row of rowsFor({
        kind: "unanswered",
        warning: "check-failed",
      })) {
        expect(row.status).toBe("check didn't run — may lose work");
        expect(row.drift).toBe(true);
      }
    });
  });

  // The reclaim deletes a leftover copy whole either way, but "the copy goes"
  // and "work nothing else holds goes" are different prices, and the row is
  // where the difference is stated (#414).
  describe("what the check says about a leftover copy", () => {
    const leftoverRow = (check: RemoveCheckState) =>
      removeLedgerRows(
        { kind: "global", tools: ["claude"] },
        [{ tool: "codex" as const, path: "/Users/me/.agents/skills/tdd" }],
        check,
      )[1];

    it("names the edits it would delete with the copy", () => {
      expect(
        leftoverRow(perTool({ claude: "none", codex: "local-edits" }))?.status,
      ).toBe("not installed — local edits deleted too");
    });

    it("keeps a copy with no baseline apart from a checked one", () => {
      expect(
        leftoverRow(perTool({ claude: "none", codex: "cannot-verify" }))
          ?.status,
      ).toBe("not installed — nothing recorded to check");
    });

    it("never reads a leftover the answer left out as a checked copy", () => {
      expect(leftoverRow(perTool({ claude: "none" }))?.status).toBe(
        "not installed — check didn't run",
      );
    });

    it("states the plain reclaim when the copy came back clean", () => {
      expect(
        leftoverRow(perTool({ claude: "none", codex: "none" }))?.status,
      ).toBe("not installed — copy deleted in full");
    });

    it("stays a cost whatever the check found", () => {
      for (const warning of ["none", "local-edits", "cannot-verify"] as const) {
        expect(leftoverRow(perTool({ codex: warning }))?.drift).toBe(true);
      }
    });
  });

  // After a failed removal the server probes the disk itself and says, per
  // target, whether the copy is still there. What the rows carried before the
  // user confirmed was a price for something that did not happen (#416).
  describe("what the server proved after a failed removal", () => {
    const globalOutcome: RemoveOutcome = {
      scope: "global",
      tools: [
        { tool: "claude", state: "removed" },
        { tool: "codex", state: "not-removed" },
      ],
    };

    it("puts each detected tool's proven outcome on its own row", () => {
      const [claude, codex] = removeLedgerRows(
        { kind: "global", tools: ["claude", "codex"] },
        [],
        perTool({ claude: "none", codex: "none" }),
        globalOutcome,
      );

      expect(claude?.outcome).toBe("removed");
      expect(codex?.outcome).toBe("not-removed");
    });

    it("keeps the order the ledger showed before the user confirmed", () => {
      // The screen listed Codex first; the report answers Claude Code first.
      // The rows are the user's, so they do not reshuffle under the answer.
      expect(
        removeLedgerRows(
          { kind: "global", tools: ["codex", "claude"] },
          [],
          perTool({}),
          globalOutcome,
        ).map((row) => [row.name, row.outcome]),
      ).toEqual([
        ["Codex", "not-removed"],
        ["Claude Code", "removed"],
      ]);
    });

    it("drops the price it named for a removal that did not happen", () => {
      const [claude] = removeLedgerRows(
        { kind: "global", tools: ["claude", "codex"] },
        [],
        perTool({ claude: "local-edits", codex: "local-edits" }),
        globalOutcome,
      );

      expect(claude?.status).toBeNull();
      expect(claude?.drift).toBe(false);
    });

    it("drops a leftover copy the failure never reached", () => {
      // The reclaim runs only after apm confirms, so nothing touched this copy
      // and the report has nothing to say about it.
      expect(
        removeLedgerRows(
          { kind: "global", tools: ["claude", "codex"] },
          leftoverCodex,
          perTool({}),
          globalOutcome,
        ).map((row) => row.name),
      ).toEqual(["Claude Code", "Codex"]);
    });

    it("puts the repo scope's one answer on its one row", () => {
      const [repo] = removeLedgerRows(
        { kind: "repo", repoPath: "/Users/me/project" },
        [],
        { kind: "repo", warning: "local-edits" },
        { scope: "repo", state: "unknown" },
      );

      expect(repo?.outcome).toBe("unknown");
    });
  });

  // Counted from what the server proved, never from what is on screen — the
  // screen's own rows can outnumber the targets apm ever reached.
  describe("removeLedgerLeadIn", () => {
    it("asks the question while nothing has been attempted", () => {
      expect(removeLedgerLeadIn(null)).toBe("Primitive will be removed from:");
    });

    it("counts the targets the removal came off", () => {
      expect(
        removeLedgerLeadIn({
          scope: "global",
          tools: [
            { tool: "claude", state: "removed" },
            { tool: "codex", state: "not-removed" },
          ],
        }),
      ).toBe("Removed from 1 of 2 targets:");
    });

    it("counts an unproven target as one the removal did not come off", () => {
      expect(
        removeLedgerLeadIn({
          scope: "global",
          tools: [
            { tool: "claude", state: "unknown" },
            { tool: "codex", state: "unknown" },
          ],
        }),
      ).toBe("Removed from 0 of 2 targets:");
    });

    it("speaks of one target in the singular", () => {
      expect(removeLedgerLeadIn({ scope: "repo", state: "removed" })).toBe(
        "Removed from 1 of 1 target:",
      );
    });
  });

  // A repo has one row, and its deployed copy spans several tool subtrees, so
  // the aggregate answer is the honest thing to state — on that one row.
  it("puts the repo scope's aggregate answer on its single row", () => {
    const [repo] = removeLedgerRows(
      { kind: "repo", repoPath: "/Users/me/project" },
      [],
      { kind: "repo", warning: "local-edits" },
    );

    expect(repo?.status).toBe("local edits — deleted too");
    expect(repo?.drift).toBe(true);
  });
});
