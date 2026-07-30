// Parses the Rich table `apm outdated` prints — it has no --json
// (apm-behavior.md § Drift). Identity is the last path segment of the Package
// cell, because Rich truncates the full ref at narrow widths.

import { isValidSkillSlug } from "../deploy/package-ref";

// A pair, not a binary flag: behind/up-to-date stays derivable (ADR-0007).
export type VersionDrift = { name: string; current: string; latest: string };

// A union, never a bare array: an empty set meaning "I did not understand the
// output" would render as up-to-date, the false reassurance J04 forbids.
// "unverified" is apm reached but could not resolve; absent is a real failure.
export type OutdatedResult =
  | { ok: true; behind: VersionDrift[] }
  | { ok: false; reason?: "unverified" };

// apm's own statement that nothing is behind. Absent, with no rows parsed, the
// output is unrecognised — not empty (apm-behavior.md § Drift).
const UP_TO_DATE = /All dependencies are up-to-date/;
const NO_REMOTE = /No remote dependencies to check/;

// Either signal marks the run unverified (fixture
// apm-outdated-could-not-check.txt).
const COULD_NOT_CHECK = /could not be checked/;
const UNCHECKABLE_STATUS = "unknown";

// The three fields below are the only apm-derived data that reaches the browser,
// so this parse is where their shape is checked — the place apm's output is first
// read (ADR-0018). An allowlist, not a blocklist (security.md): one short word of
// letters, digits, dots and hyphens. A path needs a slash, a credentialed URL a
// colon and an at-sign, a token an underscore, and every one of them is longer
// than the cap — so two independent limits refuse each shape. Deliberately not
// pinned to `vX.Y.Z`: apm leaves these cells unconstrained and legitimately
// writes a bare word like `unknown`, and refusing that would turn a genuine
// behind row into a failed read the cockpit shows as "could not check".
const VERSION_CELL = /^[0-9A-Za-z][0-9A-Za-z.-]{0,31}$/;

// Status is read by position, never by scanning the row for a bare token: the
// other four columns hold data apm does not constrain.
const [PACKAGE, CURRENT, LATEST, STATUS] = [0, 1, 2, 3];
const COLUMN_COUNT = 5;

// Splits on the light vertical bar, which only data rows use — header and
// separators use heavy glyphs. Empty cells keep their place, which the
// uncheckable row (empty Source cell) relies on (apm-behavior.md § Drift).
const cellsOf = (line: string): string[] | null => {
  if (!line.includes("│")) {
    return null;
  }
  const cells = line
    .split("│")
    .slice(1, -1)
    .map((cell) => cell.trim());
  return cells.length === COLUMN_COUNT ? cells : null;
};

const rowsOf = (output: string): string[][] =>
  output
    .split("\n")
    .map(cellsOf)
    .filter((cells) => cells !== null);

const lastSegment = (packageCell: string): string =>
  packageCell.split("/").at(-1) ?? packageCell;

const hasUncheckable = (output: string): boolean =>
  COULD_NOT_CHECK.test(output) ||
  rowsOf(output).some((cells) => cells[STATUS] === UNCHECKABLE_STATUS);

// Null means a row claimed to be outdated but did not hold the shape its three
// forwarded fields must have. Refusing the whole read rather than skipping the
// row: skipping would render that skill up-to-date, the false reassurance J04
// forbids, and it is also how a leak would go unnoticed.
const behindFromRows = (output: string): VersionDrift[] | null => {
  const behind: VersionDrift[] = [];
  for (const cells of rowsOf(output)) {
    const packageCell = cells[PACKAGE];
    const current = cells[CURRENT];
    const latest = cells[LATEST];
    if (
      cells[STATUS] !== "outdated" ||
      packageCell === undefined ||
      current === undefined ||
      latest === undefined
    ) {
      continue;
    }
    const name = lastSegment(packageCell);
    if (
      !isValidSkillSlug(name) ||
      !VERSION_CELL.test(current) ||
      !VERSION_CELL.test(latest)
    ) {
      return null;
    }
    behind.push({ name, current, latest });
  }
  return behind;
};

export const parseOutdated = (output: string): OutdatedResult => {
  if (UP_TO_DATE.test(output) || NO_REMOTE.test(output)) {
    return { ok: true, behind: [] };
  }

  // Before row parsing: one outdated plus one uncheckable dep must not report
  // ok+behind and drop the uncheckable one to a false up-to-date (J04).
  if (hasUncheckable(output)) {
    return { ok: false, reason: "unverified" };
  }

  const behind = behindFromRows(output);
  if (behind === null) {
    return { ok: false };
  }
  if (behind.length > 0) {
    return { ok: true, behind };
  }

  // No rows and no banner: the table shape changed under us. Fail rather than
  // report a false up-to-date.
  return { ok: false };
};
