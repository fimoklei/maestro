import { describe, expect, it } from "vitest";
import { parseOutdated } from "./parse-outdated";

// Captured output of `apm outdated -g`, holding on apm 0.26.0 — the capture
// dates from the 0.16.0 spike and was re-run unchanged, not re-taken, so it
// carries no 0.26.0 capture date (tests/fixtures/README.md, ✓=). The full file
// lives in tests/fixtures/apm-outdated-global.txt; inlined here so the pure lane
// stays free of file I/O. Identity is the skill name — the last path segment of
// the Package cell — never the full owner/repo/skills/<name> string.
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

  it("reports a dep apm could not check as unverified, never up-to-date", () => {
    // apm reached the tool but could not resolve the tag-pinned dep against its
    // remote (no auth/network): exit 0, a row with Status "unknown" / Latest "-"
    // and a "could not be checked" summary. This is a reachability failure — not
    // up-to-date and not a crash — so it must read as unverified, distinct from a
    // bare failure, and never as an empty behind set (the J04 lie).
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
    // Only the Status column states what apm concluded. The other four carry a
    // package name, two version strings and a source — content apm does not
    // constrain, so any of them may legitimately read "unknown". A row whose
    // Status says "outdated" is a resolved check whatever the rest holds;
    // scanning the whole row for the token would call it a reachability failure.
    const unknownVersion =
      "│ owner/repo/skills/tdd │ unknown │ v0.5.1 │ outdated │ git tags │";
    expect(parseOutdated(unknownVersion)).toEqual({
      ok: true,
      behind: [{ name: "tdd", current: "unknown", latest: "v0.5.1" }],
    });
  });

  it("finds the Status column on an uncheckable row despite its empty Source cell", () => {
    // The uncheckable row's Source cell is empty (fixture
    // apm-outdated-could-not-check.txt), so a parser that drops empty cells
    // shifts every later column left. Without the summary banner the Status
    // column is the only signal left, so it must be read by position — an empty
    // cell has to keep its place.
    const rowOnly = "│ owner/repo/skills/tdd │ v0.5.0 │ - │ unknown │ │";
    expect(parseOutdated(rowOnly)).toEqual({ ok: false, reason: "unverified" });
  });

  it("never lets an uncheckable dep hide behind a checkable outdated one", () => {
    // A mix of one outdated (resolved) and one uncheckable dep. Parsing only the
    // outdated row would drop the uncheckable one, silently rendering it
    // up-to-date. When any dep could not be checked the whole result is
    // unverified — the outdated pair is not worth a false up-to-date on the other.
    const mixed = [
      "│ owner/repo/skills/tdd │ v0.5.0 │ v0.5.1 │ outdated │ git tags │",
      "│ owner/repo/skills/foo │ v1.0.0 │ - │ unknown │ │",
      "[i] Some dependencies could not be checked (branch/commit refs)",
    ].join("\n");
    expect(parseOutdated(mixed)).toEqual({ ok: false, reason: "unverified" });
  });

  // These three fields are the only apm-derived data the cockpit sends to the
  // browser, so this parse is where their shape is checked (ADR-0018). A cell
  // that does not match is never forwarded and never dropped to a silent
  // up-to-date: the whole read fails, the way an unrecognised table already does.
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
      // Generous on purpose: too strict a version shape would turn a genuine
      // behind row into a failed read, which reads as "we could not check".
      expect(
        parseOutdated(row("owner/repo/skills/tdd", "v1.2.3-rc.1", "v1.2.4")),
      ).toEqual({
        ok: true,
        behind: [{ name: "tdd", current: "v1.2.3-rc.1", latest: "v1.2.4" }],
      });
    });
  });
});
