import { describe, expect, it } from "vitest";
import { removeLedgerRows } from "./remove-ledger-rows";

const leftoverCodex = [
  { tool: "codex" as const, path: "/Users/me/.agents/skills/tdd" },
];

describe("removeLedgerRows", () => {
  it("states the repo path as the only row", () => {
    expect(
      removeLedgerRows({ kind: "repo", repoPath: "/Users/me/project" }, []),
    ).toEqual([
      {
        key: "target:/Users/me/project",
        name: "/Users/me/project",
        path: null,
        status: null,
        drift: false,
      },
    ]);
  });

  it("keeps the detected tools in the order it was handed them", () => {
    expect(
      removeLedgerRows({ kind: "global", tools: ["codex", "claude"] }, []).map(
        (row) => row.name,
      ),
    ).toEqual(["Codex", "Claude Code"]);
  });

  it("puts a leftover copy after every detected tool", () => {
    const rows = removeLedgerRows(
      { kind: "global", tools: ["claude"] },
      leftoverCodex,
    );

    expect(rows.map((row) => row.name)).toEqual(["Claude Code", "Codex"]);
  });

  it("carries the leftover's path and status on its own row", () => {
    const [leftover] = removeLedgerRows(
      { kind: "global", tools: [] },
      leftoverCodex,
    );

    expect(leftover).toEqual({
      key: "leftover:codex",
      name: "Codex",
      path: "/Users/me/.agents/skills/tdd",
      status: "not installed — copy deleted in full",
      drift: true,
    });
  });

  it("gives a detected tool no status and no drift", () => {
    const [detected] = removeLedgerRows(
      { kind: "global", tools: ["claude"] },
      [],
    );

    expect(detected?.status).toBeNull();
    expect(detected?.drift).toBe(false);
  });
});
