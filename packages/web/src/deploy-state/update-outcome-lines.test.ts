import type { UpdateOutcomeRow } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { updateOutcomeLines } from "./update-outcome-lines";

const RELEASES = { from: "v0.3.2", to: "v0.3.4" };

describe("update outcome lines", () => {
  it("states one line per skill on a target with no tools of its own", () => {
    const rows: UpdateOutcomeRow[] = [
      { name: "tdd", tool: null, state: "updated" },
      { name: "review", tool: null, state: "removed" },
      { name: "grill", tool: null, state: "not-updated" },
    ];

    expect(updateOutcomeLines(rows, RELEASES)).toStrictEqual([
      { key: "tdd:", ok: true, text: "tdd updated to v0.3.4" },
      { key: "review:", ok: true, text: "review removed" },
      { key: "grill:", ok: false, text: "grill still at v0.3.2" },
    ]);
  });

  it("states a skill once where every tool agrees", () => {
    const rows: UpdateOutcomeRow[] = [
      { name: "tdd", tool: "claude", state: "updated" },
      { name: "tdd", tool: "codex", state: "updated" },
    ];

    expect(updateOutcomeLines(rows, RELEASES)).toStrictEqual([
      { key: "tdd:", ok: true, text: "tdd updated to v0.3.4" },
    ]);
  });

  it("names the tool on each line where the tools disagree", () => {
    const rows: UpdateOutcomeRow[] = [
      { name: "grill", tool: "claude", state: "updated" },
      { name: "grill", tool: "codex", state: "not-updated" },
    ];

    expect(updateOutcomeLines(rows, RELEASES)).toStrictEqual([
      {
        key: "grill:claude",
        ok: true,
        text: "grill updated to v0.3.4 in Claude Code",
      },
      {
        key: "grill:codex",
        ok: false,
        text: "grill still at v0.3.2 in Codex",
      },
    ]);
  });
});
