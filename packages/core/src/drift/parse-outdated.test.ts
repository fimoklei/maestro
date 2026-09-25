import { describe, expect, it } from "vitest";
import { parseOutdated } from "./parse-outdated";

// Captured `apm outdated -g` output, inlined to keep this lane free of file I/O.
// Identity is the skill name: the last segment of the Package cell.
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
  it("returns the deployed -> latest version pair per behind skill", () => {
    expect(parseOutdated(outdatedTable)).toEqual({
      ok: true,
      behind: [{ name: "tdd", current: "v0.5.0", latest: "v0.5.1" }],
    });
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

  it("recovers the pair from a narrow-width row whose name still fits", () => {
    const narrow =
      "│ fimoklei/agent-harness/skills/tdd │ v0.5.0 │ v0.5.1 │ outdated │ git tags │";
    expect(parseOutdated(narrow)).toEqual({
      ok: true,
      behind: [{ name: "tdd", current: "v0.5.0", latest: "v0.5.1" }],
    });
  });

  it("ignores rows whose status is not outdated", () => {
    const mixed = [
      "│ owner/repo/skills/tdd      │ v1.0.0 │ v1.1.0 │ outdated  │ git tags │",
      "│ owner/repo/skills/diagnose │ v2.0.0 │ v2.0.0 │ up-to-date│ git tags │",
    ].join("\n");
    expect(parseOutdated(mixed)).toEqual({
      ok: true,
      behind: [{ name: "tdd", current: "v1.0.0", latest: "v1.1.0" }],
    });
  });

  it("fails when apm reports outdated deps but no row parses", () => {
    // An unrecognised table must fail, never read as up-to-date.
    const driftedFormat = [
      "│ owner/repo/skills/tdd │ v1.0.0 │ v1.1.0 │ outdated │ git tags │ extra │",
      "[!] 1 outdated dependency found",
    ].join("\n");
    expect(parseOutdated(driftedFormat)).toEqual({ ok: false });
  });

  it("fails on unrecognised output that is neither a known empty state nor a table", () => {
    expect(parseOutdated("apm: command not found\n")).toEqual({ ok: false });
  });

  it("reports a dep apm could not check as unverified, never up-to-date", () => {
    // An unresolvable remote is unverified: never up-to-date, never a crash.
    const couldNotCheck = [
      "                                          Dependency Status",
      "│ fimoklei/agent-harness/skills/tdd │ v0.5.1 │ - │ unknown │ │",
      "[i] Some dependencies could not be checked (branch/commit refs)",
    ].join("\n");
    expect(parseOutdated(couldNotCheck)).toEqual({
      ok: false,
      reason: "unverified",
    });
  });

  it("reads 'unknown' outside the Status column as ordinary data, not uncheckable", () => {
    // Only Status states apm's conclusion; other cells may read "unknown".
    const unknownVersion =
      "│ owner/repo/skills/tdd │ unknown │ v0.5.1 │ outdated │ git tags │";
    expect(parseOutdated(unknownVersion)).toEqual({
      ok: true,
      behind: [{ name: "tdd", current: "unknown", latest: "v0.5.1" }],
    });
  });

  it("finds the Status column on an uncheckable row despite its empty Source cell", () => {
    // The Source cell is empty; dropping empty cells would shift Status left.
    const rowOnly = "│ owner/repo/skills/tdd │ v0.5.0 │ - │ unknown │ │";
    expect(parseOutdated(rowOnly)).toEqual({ ok: false, reason: "unverified" });
  });

  it("never lets an uncheckable dep hide behind a checkable outdated one", () => {
    // Any uncheckable dep makes the whole result unverified.
    const mixed = [
      "│ owner/repo/skills/tdd │ v0.5.0 │ v0.5.1 │ outdated │ git tags │",
      "│ owner/repo/skills/foo │ v1.0.0 │ - │ unknown │ │",
      "[i] Some dependencies could not be checked (branch/commit refs)",
    ].join("\n");
    expect(parseOutdated(mixed)).toEqual({ ok: false, reason: "unverified" });
  });

  // These cells reach the browser: a bad shape fails the whole read.
  describe("shape of the fields it forwards", () => {
    const row = (name: string, current: string, latest: string) =>
      `│ ${name} │ ${current} │ ${latest} │ outdated │ git tags │`;

    it("refuses a package cell whose last segment is not a skill slug", () => {
      expect(
        parseOutdated(row("owner/repo/skills/Not A Slug", "v0.5.0", "v0.5.1")),
      ).toEqual({ ok: false });
    });

    it("refuses a version cell carrying a path", () => {
      expect(
        parseOutdated(
          row(
            "owner/repo/skills/tdd",
            "v0.5.0",
            "/Users/someone/.codex/skills/secret-scan",
          ),
        ),
      ).toEqual({ ok: false });
    });

    it("refuses a version cell carrying a credential-bearing URL", () => {
      expect(
        parseOutdated(
          row(
            "owner/repo/skills/tdd",
            "https://x-access-token:ghp_secret@github.com/o/r.git",
            "v0.5.1",
          ),
        ),
      ).toEqual({ ok: false });
    });

    it("refuses a version cell carrying a bare token", () => {
      expect(
        parseOutdated(
          row("owner/repo/skills/tdd", "v0.5.0", "ghp_secret_0123456789"),
        ),
      ).toEqual({ ok: false });
    });

    it("accepts the prerelease tags a real harness publishes", () => {
      // Generous on purpose: too strict turns a real behind row into a failed read.
      expect(
        parseOutdated(row("owner/repo/skills/tdd", "v1.2.3-rc.1", "v1.2.4")),
      ).toEqual({
        ok: true,
        behind: [{ name: "tdd", current: "v1.2.3-rc.1", latest: "v1.2.4" }],
      });
    });
  });
});
