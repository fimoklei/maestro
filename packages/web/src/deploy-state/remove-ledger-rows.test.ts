import { describe, expect, it } from "vitest";
import { removeLedgerRows } from "./remove-ledger-rows";
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
