import { describe, expect, it } from "vitest";
import { parseOutdated } from "./parse-outdated";

// Captured output of `apm outdated` (apm 0.20.0). The full file lives in
// tests/fixtures/apm-outdated-global.txt; inlined here so the pure lane stays
// free of file I/O. Identity is the skill name — the last path segment of the
// Package cell — never the full owner/repo/skills/<name> string.
const outdatedTable = `
                                          Dependency Status
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━┓
┃ Package                           ┃ Current    ┃ Latest     ┃ Status       ┃ Source               ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━┩
│ fimoklei/agent-harness/skills/tdd │ v0.5.0     │ v0.5.1     │ outdated     │ git tags             │
└───────────────────────────────────┴────────────┴────────────┴──────────────┴──────────────────────┘
[!] 1 outdated dependency found
`;

describe("parseOutdated", () => {
  it("returns the behind skill name from an outdated table", () => {
    expect(parseOutdated(outdatedTable)).toEqual({ ok: true, behind: ["tdd"] });
  });

  it("recognises 'all dependencies are up-to-date' as an empty behind set", () => {
    expect(parseOutdated("\n[*] All dependencies are up-to-date\n")).toEqual({
      ok: true,
      behind: [],
    });
  });

  it("recognises 'no remote dependencies to check' as an empty behind set", () => {
    expect(parseOutdated("\n[*] No remote dependencies to check\n")).toEqual({
      ok: true,
      behind: [],
    });
  });

  it("recovers the name from a narrow-width row whose name still fits", () => {
    const narrow =
      "│ fimoklei/agent-harness/skills/tdd │ v0.5.0 │ v0.5.1 │ outdated │ git tags │";
    expect(parseOutdated(narrow)).toEqual({ ok: true, behind: ["tdd"] });
  });

  it("ignores rows whose status is not outdated", () => {
    const mixed = [
      "│ owner/repo/skills/tdd      │ v1.0.0 │ v1.1.0 │ outdated  │ git tags │",
      "│ owner/repo/skills/diagnose │ v2.0.0 │ v2.0.0 │ up-to-date│ git tags │",
    ].join("\n");
    expect(parseOutdated(mixed)).toEqual({ ok: true, behind: ["tdd"] });
  });

  it("fails when apm reports outdated deps but no row parses", () => {
    // Simulates a Rich format change (an extra column) under the summary line:
    // the summary says something is outdated, yet no recognised row survives.
    // Returning behind:[] here would falsely read as up-to-date — the failure
    // mode J04 exists to prevent — so the check is reported as failed instead.
    const driftedFormat = [
      "│ owner/repo/skills/tdd │ v1.0.0 │ v1.1.0 │ outdated │ git tags │ extra │",
      "[!] 1 outdated dependency found",
    ].join("\n");
    expect(parseOutdated(driftedFormat)).toEqual({ ok: false });
  });

  it("fails on unrecognised output that is neither a known empty state nor a table", () => {
    expect(parseOutdated("apm: command not found\n")).toEqual({ ok: false });
  });
});
